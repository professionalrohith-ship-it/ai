/** Three bouncing dots shown while a answer is being prepared. */
export function TypingIndicator() {
  return (
    <span role="status" aria-label="CODEMIND AI is typing" className="inline-flex items-center gap-1 py-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-brand"
          style={{ animationDelay: `${delay}ms`, animationDuration: '1s' }}
        />
      ))}
    </span>
  )
}
