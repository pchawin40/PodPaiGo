import type { ReactNode } from 'react';

type TravelCardProps = {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
  padding?: 'none' | 'sm' | 'md' | 'lg';
};

const paddingClass = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

export default function TravelCard({
  children,
  className = '',
  as: Tag = 'div',
  padding = 'md',
}: TravelCardProps) {
  return (
    <Tag className={`travel-card rounded-2xl ${paddingClass[padding]} ${className}`}>
      {children}
    </Tag>
  );
}
