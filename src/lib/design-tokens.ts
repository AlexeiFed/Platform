export const tokens = {
  colors: {
    brand: {
      50: "hsl(250, 100%, 97%)",
      100: "hsl(250, 100%, 94%)",
      200: "hsl(250, 100%, 88%)",
      300: "hsl(250, 97%, 80%)",
      400: "hsl(250, 95%, 70%)",
      500: "hsl(250, 90%, 60%)",
      600: "hsl(250, 80%, 52%)",
      700: "hsl(250, 70%, 44%)",
      800: "hsl(250, 60%, 36%)",
      900: "hsl(250, 50%, 28%)",
    },
    success: "hsl(142, 71%, 45%)",
    warning: "hsl(38, 92%, 50%)",
    error: "hsl(0, 84%, 60%)",
  },
  spacing: {
    page: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8",
    section: "py-8 sm:py-12 lg:py-16",
    card: "p-4 sm:p-6",
  },
  radius: {
    sm: "rounded-md",
    md: "rounded-lg",
    lg: "rounded-xl",
    full: "rounded-full",
  },
  shadow: {
    sm: "shadow-sm",
    md: "shadow-md",
    lg: "shadow-lg",
    card: "shadow-sm hover:shadow-md transition-shadow",
  },
  typography: {
    h1: "text-3xl sm:text-4xl font-bold tracking-tight",
    h2: "text-2xl sm:text-3xl font-semibold tracking-tight",
    h3: "text-xl sm:text-2xl font-semibold",
    h4: "text-lg font-semibold",
    body: "text-base text-muted-foreground",
    small: "text-sm text-muted-foreground",
    label: "text-sm font-medium",
  },
  animation: {
    fast: "transition-all duration-150 ease-in-out",
    normal: "transition-all duration-300 ease-in-out",
    slow: "transition-all duration-500 ease-in-out",
  },
} as const;

export const layout = {
  sidebar: {
    width: "w-64",
    collapsedWidth: "w-16",
  },
  header: {
    height: "h-16",
  },
  content: {
    maxWidth: "max-w-7xl",
  },
} as const;
