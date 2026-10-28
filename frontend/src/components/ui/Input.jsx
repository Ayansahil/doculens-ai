import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const Input = forwardRef(({ 
  type = 'text',
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  className = '',
  containerClassName = '',
  showPasswordToggle = false,
  ...props 
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(false);
  
  const inputType = type === 'password' && showPassword ? 'text' : type;
  
  const baseClasses = `
    block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm 
    placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 
    focus:border-primary-500 transition-colors duration-200
    disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
  `;
  
  const errorClasses = error ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : '';
  const leftPadding = leftIcon ? 'pl-10' : '';
  const rightPadding = rightIcon || (type === 'password' && showPasswordToggle) ? 'pr-10' : '';
  
  return (
    <div className={containerClassName}>
      {label && (
        <label className={`block text-sm font-medium mb-1 ${error ? 'text-red-700' : 'text-gray-700'}`}>
          {label}
        </label>
      )}
      
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <div className={`h-5 w-5 ${focused || props.value ? 'text-primary-500' : 'text-gray-400'}`}>
              {leftIcon}
            </div>
          </div>
        )}
        
        <input
          ref={ref}
          type={inputType}
          className={`${baseClasses} ${errorClasses} ${leftPadding} ${rightPadding} ${className}`}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        
        {(rightIcon || (type === 'password' && showPasswordToggle)) && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            {type === 'password' && showPasswordToggle ? (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="h-5 w-5 text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            ) : rightIcon ? (
              <div className="flex items-center text-gray-400">
                {rightIcon}
              </div>
            ) : null}
          </div>
        )}
      </div>
      
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;