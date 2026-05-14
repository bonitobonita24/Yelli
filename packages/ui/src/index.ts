// =============================================================
// @yelli/ui — Public Package Entry
//
// Re-exports the shadcn/ui primitives and utilities consumed by
// apps/web (and any future apps). Per Rule 26, this is the ONLY
// permitted component library — no MUI, Chakra, Ant Design, etc.
// =============================================================

export { Button, buttonVariants } from './components/button';
export type { ButtonProps } from './components/button';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/card';

export { Input } from './components/input';
export type { InputProps } from './components/input';

export { Label } from './components/label';

export { Textarea } from './components/textarea';
export type { TextareaProps } from './components/textarea';

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './components/dialog';

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from './components/select';

export {
  Toast,
  ToastProvider,
  ToastViewport,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
} from './components/toast';
export type { ToastProps, ToastActionElement } from './components/toast';

export { Toaster } from './components/toaster';
export { Toaster as SonnerToaster } from './components/sonner';

export { useToast, toast } from './components/use-toast';

export { Badge, badgeVariants } from './components/badge';
export type { BadgeProps } from './components/badge';

export { Alert, AlertTitle, AlertDescription } from './components/alert';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './components/table';

export { cn } from './lib/utils';
