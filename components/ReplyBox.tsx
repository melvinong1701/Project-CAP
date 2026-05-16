'use client'
import { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Smile } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReplyBoxProps {
  onSend: (text: string) => void
  initialValue?: string
}

export function ReplyBox({ onSend, initialValue = '' }: ReplyBoxProps) {
  const [value, setValue] = useState(initialValue)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [value])

  const handleSend = () => {
    if (!value.trim()) return
    onSend(value.trim())
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-gray-100 bg-white p-4">
      <div className="flex items-end gap-3 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2.5 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a reply… (Enter to send)"
          rows={1}
          className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 resize-none outline-none leading-relaxed min-h-[24px]"
        />
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded">
            <Paperclip className="w-4 h-4" />
          </button>
          <button className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded">
            <Smile className="w-4 h-4" />
          </button>
          <button
            onClick={handleSend}
            disabled={!value.trim()}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              value.trim()
                ? 'text-white bg-indigo-600 hover:bg-indigo-700'
                : 'text-gray-300 bg-gray-100 cursor-not-allowed'
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-1.5 text-right">Shift+↵ for new line</p>
    </div>
  )
}
