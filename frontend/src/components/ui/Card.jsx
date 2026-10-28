import { forwardRef } from 'react';

const Card = forwardRef(({ 
  children, 
  className = '', 
  padding = 'md',
  shadow = 'sm',
  hover = false,
  ...props 
}, ref) => {
  const baseClasses = 'bg-white rounded-lg border border-gray-200';
  
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-12'
  };
  
  const shadows = {
    none: '',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl'
  };
  
  const hoverEffect = hover ? 'hover:shadow-md transition-shadow duration-200' : '';
  // `none` maps to an empty class string, so a truthiness check would wrongly
  // fall back to the default padding.
  const paddingClasses = padding in paddings ? paddings[padding] : paddings.md;
  const shadowClasses = shadows[shadow] || shadows.sm;
  
  return (
    <div
      ref={ref}
      className={`${baseClasses} ${paddingClasses} ${shadowClasses} ${hoverEffect} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

export const CardHeader = ({ children, className = '' }) => (
  <div className={`pb-4 border-b border-gray-200 ${className}`}>
    {children}
  </div>
);

export const CardBody = ({ children, className = '' }) => (
  <div className={`py-4 ${className}`}>
    {children}
  </div>
);

export const CardFooter = ({ children, className = '' }) => (
  <div className={`pt-4 border-t border-gray-200 ${className}`}>
    {children}
  </div>
);

export default Card;