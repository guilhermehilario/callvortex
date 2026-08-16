interface AvatarProps {
  name: string
  color: string
  size?: number
  online?: boolean
  url?: string | null
  className?: string
}

export default function Avatar({ name, color, size = 32, online, url, className = '' }: AvatarProps): React.JSX.Element {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div className={`avatar-wrap ${className}`} style={{ width: size, height: size }}>
      {url ? (
        <img
          className="avatar-img"
          src={url}
          alt={name}
          title={name}
          style={{ width: size, height: size }}
          onError={(e) => {
            // se a imagem falhar, volta para a inicial colorida
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <div className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.45 }}>
          {initial}
        </div>
      )}
      {online !== undefined && (
        <span
          className={`avatar-status ${online ? 'avatar-status-online' : 'avatar-status-offline'}`}
          style={{ width: size * 0.28, height: size * 0.28, right: -1, bottom: -1 }}
        />
      )}
    </div>
  )
}
