import { useQueryClient } from '@tanstack/react-query'
import React from 'react'

const useRefetch = () => {
  const queryclient=useQueryClient()
  return async ()=>{
    await queryclient.refetchQueries({
        type:'active'
    })
  }
}

export default useRefetch