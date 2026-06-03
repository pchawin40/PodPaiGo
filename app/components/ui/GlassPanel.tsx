import type { ReactNode } from 'react';

type GlassPanelProps = {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'aside';
};

export default function GlassPanel({ children, className = '', as: Tag = 'div' }: GlassPanelProps) {
  return (
    <Tag className={`glass-panel rounded-2xl ${className}`}>
      {children}
    </Tag>
  );
}
