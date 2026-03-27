import React, { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion } from "framer-motion";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Button
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {
    const variants = {
      primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_-3px_rgba(0,240,160,0.3)] hover:shadow-[0_0_20px_0_rgba(0,240,160,0.4)]",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-[0_0_15px_-3px_rgba(108,99,255,0.3)]",
      outline: "border border-border bg-transparent hover:bg-white/5 text-foreground",
      ghost: "bg-transparent hover:bg-white/5 text-foreground",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_0_15px_-3px_rgba(255,77,109,0.3)]"
    };
    
    const sizes = {
      sm: "h-9 px-4 text-xs",
      md: "h-11 px-6 text-sm",
      lg: "h-14 px-8 text-base"
    };

    return (
      <button
        ref={ref}
        disabled={isLoading || props.disabled}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-medium font-sans transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <span className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

// Card
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass-panel rounded-2xl overflow-hidden", className)} {...props} />
  );
}

// Input
export const Input = React.forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-12 w-full rounded-xl border border-border/50 bg-input px-4 py-2 text-sm text-foreground shadow-inner placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 font-mono",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

// Textarea
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[120px] w-full rounded-xl border border-border/50 bg-input px-4 py-3 text-sm text-foreground shadow-inner placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-y",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

// Badge
export function Badge({ 
  className, 
  variant = 'default',
  ...props 
}: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default'|'success'|'warning'|'destructive'|'secondary' }) {
  const variants = {
    default: "bg-muted text-muted-foreground border-border",
    success: "bg-primary/10 text-primary border-primary/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
    secondary: "bg-secondary/10 text-secondary border-secondary/20",
  };
  
  return (
    <div className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors font-mono tracking-wide", variants[variant], className)} {...props} />
  );
}

// Modal/Dialog Shell
export function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        className="relative z-10 w-full max-w-lg"
      >
        <Card className="p-6 border-border shadow-2xl shadow-black/50">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-display font-bold">{title}</h2>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          {children}
        </Card>
      </motion.div>
    </div>
  );
}
