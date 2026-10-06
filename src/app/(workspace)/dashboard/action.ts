'use server'
import { db } from '@/server/db'
import { ensureLocalUser } from '@/server/local-user'
import { syncActiveModel } from '@/server/model-settings'
import { getLangChainEmbeddings } from '@/services/embedding'
import { PROVIDER_INFO } from '@/services/llm'
import { embeddingConfig } from '@/services/llm/config'
import { createAnswerModel } from '@/services/llm/langchain'
import { contextLimitsFor, createDirectChain, createRagChain, type SourceDocument } from '@/services/rag/chain'
import { RAG_PROMPT_VERSION } from '@/services/rag/prompt'
import { createPgVectorRetriever } from '@/services/rag/retriever'
import { emitLlmCall } from '@/services/telemetry'

/** 'rag' retrieves repository code first; 'direct' asks the model with no code at all. */
export type AnswerMode = 'rag' | 'direct'

export interface AnswerMeta {
    mode: AnswerMode
    provider: string
    providerLabel: string
    location: 'local' | 'cloud'
    model: string
    embeddingModel: string
    promptVersion: string
    retrievalMs: number
    generationMs: number
    totalMs: number
    sourcesUsed: number
    grounded: boolean
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

    const selection = await syncActiveModel(db)
    const info = PROVIDER_INFO[selection.provider]
    const answerModel = createAnswerModel(selection)
    const operation = mode === 'rag' ? 'rag_answer' : 'direct_answer'
    const started = Date.now()

    try {
        let answer: string
        let sources: SourceDocument[] = []
        let retrievalMs = 0

        if (mode === 'rag') {
            const baseRetrieve = createPgVectorRetriever(db, getLangChainEmbeddings(projectId), projectId)
            const result = await createRagChain({
                llm: answerModel.llm,
                callbacks: answerModel.callbacks,
                limits: contextLimitsFor(selection.provider),
                retrieve: async (q) => {
                    const t = Date.now()
                    const docs = await baseRetrieve(q)
                    retrievalMs = Date.now() - t
                    return docs
                },
            })(trimmed)
            answer = result.answer
            sources = result.sources
        } else {
            const { name, githubUrl } = membership.project
            answer = await createDirectChain({ llm: answerModel.llm, callbacks: answerModel.callbacks })(trimmed, `${name} (${githubUrl})`)
        }

        const totalMs = Date.now() - started
        const generated = mode === 'direct' || sources.length > 0
        const generationMs = generated ? totalMs - retrievalMs : 0
        const generation = generated ? answerModel.getMetrics() : {}

        if (generated) {
            emitLlmCall({
                projectId,
                operation,
                provider: selection.provider,
                model: selection.model,
                success: true,
                inputChars: trimmed.length,
                latencyMs: generationMs,
                ...generation,
            })
        }

        const meta: AnswerMeta = {
            mode,
            provider: selection.provider,
            providerLabel: info.label,
            location: info.location,
            model: selection.model,
            embeddingModel: embeddingConfig.model,
            promptVersion: RAG_PROMPT_VERSION,
            retrievalMs,
            generationMs,
            totalMs,
            sourcesUsed: sources.length,
            grounded: sources.length > 0,
            ...generation,
        }
        console.log(JSON.stringify({ event: 'answer', projectId, ...meta }))

        const filesReferences: FileReference[] = sources.map((doc) => ({
            fileName: doc.metadata.source,
            sourceCode: doc.pageContent,
            summary: doc.metadata.summary,
            similarity: doc.metadata.score,
        }))

        return { output: answer, filesReferences, meta }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        emitLlmCall({
            projectId,
            operation,
            provider: selection.provider,
            model: selection.model,
            success: false,
            error: message.slice(0, 500),
            inputChars: trimmed.length,
            latencyMs: Date.now() - started,
        })
        console.error(JSON.stringify({ event: 'answer.error', projectId, provider: selection.provider, model: selection.model, message }))
        // Cloud errors (rate limit, overloaded model) are worth showing as they are.
        throw new Error(
            info.location === 'cloud'
                ? `${info.label} (${selection.model}) failed: ${message}`
                : 'The local model did not respond. Make sure Ollama is running, then try again.',
        )
    }
}
