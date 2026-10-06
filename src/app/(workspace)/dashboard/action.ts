'use server'
import { db } from '@/server/db'
import { ensureLocalUser } from '@/server/local-user'
import { syncActiveModel } from '@/server/model-settings'
import { getLangChainEmbeddings } from '@/services/embedding'
import { PROVIDER_INFO, isProviderConfigured, type ModelSelection } from '@/services/llm'
import { cloudConfig, embeddingConfig, llmConfig } from '@/services/llm/config'
import { createAnswerModel } from '@/services/llm/langchain'
import type { CompletionMetrics } from '@/services/llm/provider'
import { NO_CONTEXT_ANSWER, contextLimitsFor, createDirectChain, createRagChain, type SourceDocument } from '@/services/rag/chain'
import { ESCALATION_REASONS, escalationReason, modelTiers } from '@/services/rag/escalation'
import { RAG_PROMPT_VERSION } from '@/services/rag/prompt'
import { createProjectRetriever } from '@/services/rag/retriever'
import { emitLlmCall, type LlmOperation } from '@/services/telemetry'

/**
 * 'rag' retrieves repository code first; 'direct' asks the model with no code at all;
 * 'auto' answers with RAG on the small local model and suggests a larger model when
 * the answer looks weak; 'escalate' re-asks on that larger model once the user approves.
 */
export type AnswerMode = 'rag' | 'direct' | 'auto' | 'escalate'

export interface ModelRef {
    provider: string
    providerLabel: string
    location: 'local' | 'cloud'
    model: string
}

/** Offered after an 'auto' answer: the larger model the user can approve scaling up to. */
export interface EscalationSuggestion {
    to: ModelRef
    /** Set when the local answer looks weak, so scaling up is recommended. */
    reason?: string
}

export interface AnswerMeta extends ModelRef {
    mode: AnswerMode
    embeddingModel: string
    promptVersion: string
    retrievalMs: number
    generationMs: number
    totalMs: number
    sourcesUsed: number
    /** 'function': matched function-level chunks; 'file': matched whole-file summaries. */
    retrievalLevel?: 'function' | 'file'
    grounded: boolean
    /** Only for 'auto': a larger model the user can scale up to. */
    suggestion?: EscalationSuggestion
    /** Only for 'auto': why scaling up is not possible, when it is not. */
    keptLocalReason?: string
    /** Reported by the provider; absent when no generation happened. */
    promptTokens?: number
    completionTokens?: number
    tokensPerSecond?: number
    loadDurationMs?: number
    promptEvalMs?: number
    evalMs?: number
}

export interface FileReference {
    fileName: string
    sourceCode: string
    summary: string
    similarity: number
}

const modelRef = (selection: ModelSelection): ModelRef => ({
    provider: selection.provider,
    providerLabel: PROVIDER_INFO[selection.provider].label,
    location: PROVIDER_INFO[selection.provider].location,
    model: selection.model,
})

interface Generation {
    answer: string
    ms: number
    metrics: Partial<CompletionMetrics>
}

/** Runs one model over the question and records the call in telemetry, success or failure. */
async function generate(
    selection: ModelSelection,
    operation: LlmOperation,
    projectId: string,
    question: string,
    run: (model: ReturnType<typeof createAnswerModel>) => Promise<string>,
): Promise<Generation> {
    const model = createAnswerModel(selection)
    const started = Date.now()
    try {
        const answer = await run(model)
        const ms = Date.now() - started
        const metrics = model.getMetrics()
        emitLlmCall({ projectId, operation, provider: selection.provider, model: selection.model, success: true, inputChars: question.length, latencyMs: ms, ...metrics })
        return { answer, ms, metrics }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        emitLlmCall({ projectId, operation, provider: selection.provider, model: selection.model, success: false, error: message.slice(0, 500), inputChars: question.length, latencyMs: Date.now() - started })
        const info = PROVIDER_INFO[selection.provider]
        // Cloud errors (rate limit, overloaded model) are worth showing as they are.
        throw new Error(
            info.location === 'cloud'
                ? `${info.label} (${selection.model}) failed: ${message}`
                : 'The local model did not respond. Make sure Ollama is running, then try again.',
        )
    }
}

function ragGeneration(selection: ModelSelection, operation: LlmOperation, projectId: string, question: string, sources: SourceDocument[]) {
    return generate(selection, operation, projectId, question, async (model) => {
        const chain = createRagChain({ llm: model.llm, callbacks: model.callbacks, limits: contextLimitsFor(selection.provider), retrieve: async () => sources })
        return (await chain(question)).answer
    })
}

export async function askQuestion(question: string, projectId: string, mode: AnswerMode = 'rag') {
    const userId = await ensureLocalUser(db)

    const membership = await db.userToProject.findFirst({
        where: { userId, projectId, project: { deletedAt: null } },
        select: { id: true, project: { select: { name: true, githubUrl: true } } },
    })
    if (!membership) {
        throw new Error('You do not have access to this project')
    }

    const trimmed = question.trim()
    if (!trimmed) {
        throw new Error('Question cannot be empty')
    }

    const active = await syncActiveModel(db)
    const started = Date.now()

    let sources: SourceDocument[] = []
    let retrievalMs = 0
    let retrievalLevel: 'function' | 'file' | undefined
    if (mode !== 'direct') {
        // Chunks retrieved per question, sized to each model's context budget.
        const chunkCount = active.provider === 'ollama' ? 6 : active.provider === 'groq' ? 8 : 16
        const retriever = await createProjectRetriever(db, getLangChainEmbeddings(projectId), projectId, chunkCount)
        retrievalLevel = retriever.level
        sources = await retriever.retrieve(trimmed)
        retrievalMs = Date.now() - started
    }

    const tiers = modelTiers(active.provider === 'ollama' ? active.model : llmConfig.model, {
        groq: isProviderConfigured('groq') ? cloudConfig.groqDefaultModel : undefined,
        gemini: isProviderConfigured('gemini') ? cloudConfig.geminiDefaultModel : undefined,
    })
    let used: ModelSelection = active
    let result: Generation | null = null
    let suggestion: EscalationSuggestion | undefined
    let keptLocalReason: string | undefined

    if (mode === 'direct') {
        const { name, githubUrl } = membership.project
        result = await generate(active, 'direct_answer', projectId, trimmed, (model) =>
            createDirectChain({ llm: model.llm, callbacks: model.callbacks })(trimmed, `${name} (${githubUrl})`),
        )
    } else if (sources.length > 0 && mode === 'rag') {
        result = await ragGeneration(active, 'rag_answer', projectId, trimmed, sources)
    } else if (sources.length > 0 && mode === 'auto') {
        // Smallest tier first: the selected local model, or the default one if a cloud model is selected.
        used = tiers[0]!
        result = await ragGeneration(used, 'rag_answer', projectId, trimmed, sources)
        const reason = escalationReason(result.answer, sources)
        const next = tiers[1]
        // Nothing is sent to the cloud here: the user approves scaling up with a button.
        if (next) suggestion = { to: modelRef(next), reason: reason ? ESCALATION_REASONS[reason] : undefined }
        else if (reason) keptLocalReason = `The answer looks weak because ${ESCALATION_REASONS[reason]}, but no cloud model is configured to scale up to.`
    } else if (sources.length > 0) {
        // 'escalate': the user approved re-asking on a larger model. Try the cloud tiers in order.
        const larger = tiers.slice(1)
        if (larger.length === 0) throw new Error('No cloud model is configured. Add GEMINI_API_KEY or GROQ_API_KEY to scale up.')
        let lastError: unknown
        for (const tier of larger) {
            try {
                result = await ragGeneration(tier, 'rag_escalation', projectId, trimmed, sources)
                used = tier
                break
            } catch (error) {
                lastError = error
            }
        }
        if (!result) throw lastError instanceof Error ? lastError : new Error(String(lastError))
    }

    const totalMs = Date.now() - started
    const meta: AnswerMeta = {
        mode,
        ...modelRef(used),
        embeddingModel: embeddingConfig.model,
        promptVersion: RAG_PROMPT_VERSION,
        retrievalMs,
        generationMs: result ? totalMs - retrievalMs : 0,
        totalMs,
        sourcesUsed: sources.length,
        retrievalLevel,
        grounded: sources.length > 0,
        suggestion,
        keptLocalReason,
        ...(result?.metrics ?? {}),
    }
    console.log(JSON.stringify({ event: 'answer', projectId, ...meta, suggestion: suggestion ? { to: suggestion.to.model, reason: suggestion.reason } : undefined }))

    const filesReferences: FileReference[] = sources.map((doc) => ({
        fileName: doc.metadata.source,
        sourceCode: doc.pageContent,
        summary: doc.metadata.summary,
        similarity: doc.metadata.score,
    }))

    return { output: result?.answer ?? NO_CONTEXT_ANSWER, filesReferences, meta }
}
