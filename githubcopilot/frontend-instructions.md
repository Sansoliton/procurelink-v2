# ProcureLink v2 — Frontend Copilot Instructions

## Stack
React 18 · Vite · TypeScript (strict) · Tailwind CSS · shadcn/ui · Radix UI
TanStack Query v5 · TanStack Table v8 · React Hook Form v7 · Zod v3
React Router v6 · Axios · Recharts · Lucide React · date-fns

---

## Project Structure

```
frontend/src/
├── api/           # Axios instance + typed API functions (one file per domain)
├── components/    # Shared UI + shadcn/ui wrappers (no business logic)
├── context/       # React contexts (AuthContext, ProjectContext)
├── hooks/         # Custom hooks — one file per domain (useRequirements.ts)
├── lib/           # Pure utility functions (no React)
├── pages/         # Feature folders: auth/ requirements/ vendors/ quotations/ ...
│   └── feature/
│       ├── FeaturePage.tsx       # Route-level page component
│       ├── FeatureDetailPage.tsx
│       └── components/           # Page-local components (not shared)
├── types/         # TypeScript interfaces (one file per domain)
├── App.tsx
└── main.tsx
```

### File Naming
- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` prefixed with `use` — e.g., `useRequirements.ts`
- API modules: `camelCase.ts` — e.g., `requirements.ts`
- Types: `camelCase.ts` — e.g., `requirement.ts`
- Utilities: `camelCase.ts`

---

## TypeScript

Always use **strict mode** (`"strict": true` in tsconfig). Never use `any` — prefer `unknown` then narrow it.

```typescript
// GOOD — interface for object shapes
interface Requirement {
  id: string;
  projectId: string;
  status: RequirementStatus;
  lineItems: LineItem[];
  createdAt: string;
}

// GOOD — union type for enums
type RequirementStatus =
  | 'draft'
  | 'submitted'
  | 'rfq_sent'
  | 'quotes_received'
  | 'approved'
  | 'po_raised'
  | 'invoiced'
  | 'completed';

// GOOD — discriminated unions for API responses
type ApiResult<T> = { data: T; error: null } | { data: null; error: string };

// BAD — avoid
const req: any = fetchRequirement(id);
```

Use `satisfies` for config objects so you keep type-checking without widening:
```typescript
const statusLabels = {
  draft: 'Draft',
  submitted: 'Submitted',
} satisfies Record<RequirementStatus, string>;
```

---

## Components

### Rules
- **Functional components only** — no class components, no HOCs.
- Export as named export, not default, unless it is a page component.
- Keep components under ~150 lines. Extract logic into hooks, sub-components into `components/`.
- Never put API calls or business logic directly in JSX. Put them in hooks.
- Props interface lives in the same file, above the component.

```typescript
// GOOD pattern
interface RequirementCardProps {
  requirement: Requirement;
  onSubmit: (id: string) => void;
}

export function RequirementCard({ requirement, onSubmit }: RequirementCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{requirement.projectName}</CardTitle>
        <Badge variant={statusVariant(requirement.status)}>
          {requirement.status}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {requirement.lineItems.length} line items
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={() => onSubmit(requirement.id)}>Submit</Button>
      </CardFooter>
    </Card>
  );
}
```

### shadcn/ui Components
Always import from `@/components/ui/`. Never copy-paste raw Radix UI primitives — use shadcn wrappers.

```typescript
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
```

### Icons
Use Lucide React. Always size with `className`, not inline style.
```typescript
import { Plus, FileText, ChevronRight } from 'lucide-react';

<Plus className="h-4 w-4" />
<FileText className="h-5 w-5 text-muted-foreground" />
```

---

## Tailwind CSS

### Conventions
- Use Tailwind utility classes. No inline `style={{}}` except for dynamic values that cannot be expressed as classes.
- Use `cn()` helper (from `@/lib/utils`) to merge conditional classes.
- Prefer semantic color tokens (`text-muted-foreground`, `bg-background`, `border-border`) over raw colors.
- Responsive prefix order: mobile-first — `sm:` `md:` `lg:` `xl:`.

```typescript
import { cn } from '@/lib/utils';

// GOOD — conditional classes with cn()
<div className={cn(
  'rounded-md border p-4',
  isActive && 'border-primary bg-primary/5',
  isError && 'border-destructive',
)}>
```

### Layout Patterns
```typescript
// Page wrapper
<div className="container mx-auto py-6 space-y-6">

// Section header with action button
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-semibold tracking-tight">Requirements</h1>
    <p className="text-sm text-muted-foreground">Manage your procurement requirements</p>
  </div>
  <Button><Plus className="mr-2 h-4 w-4" />New Requirement</Button>
</div>

// Data grid / card list
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

// Form layout
<div className="space-y-4 max-w-lg">
```

---

## Data Fetching — TanStack Query v5

### Hook Conventions
One file per domain in `src/hooks/`. Export individual hooks, not a single object.

```typescript
// src/hooks/useRequirements.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as requirementsApi from '@/api/requirements';
import type { Requirement, CreateRequirementData } from '@/types/requirement';

// Keys factory — keeps invalidations consistent
export const requirementKeys = {
  all: ['requirements'] as const,
  byProject: (projectId: string) => ['requirements', projectId] as const,
  detail: (id: string, projectId: string) => ['requirements', projectId, id] as const,
};

export function useRequirements(projectId: string) {
  return useQuery({
    queryKey: requirementKeys.byProject(projectId),
    queryFn: () => requirementsApi.list(projectId),
    enabled: !!projectId,
    staleTime: 1000 * 60 * 2, // 2 min
  });
}

export function useRequirement(id: string, projectId: string) {
  return useQuery({
    queryKey: requirementKeys.detail(id, projectId),
    queryFn: () => requirementsApi.get(id, projectId),
    enabled: !!id && !!projectId,
  });
}

export function useCreateRequirement(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRequirementData) =>
      requirementsApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: requirementKeys.byProject(projectId) });
    },
  });
}

export function useSubmitRequirement(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => requirementsApi.submit(id, projectId),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: requirementKeys.detail(id, projectId) });
      queryClient.invalidateQueries({ queryKey: requirementKeys.byProject(projectId) });
    },
  });
}
```

### Query Patterns
```typescript
// GOOD — handle all states explicitly
function RequirementsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data, isLoading, isError, error } = useRequirements(projectId!);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorMessage message={error.message} />;
  if (!data?.length) return <EmptyState />;

  return <RequirementsList requirements={data} />;
}

// GOOD — optimistic update pattern
const mutation = useMutation({
  mutationFn: updateRequirement,
  onMutate: async (updated) => {
    await queryClient.cancelQueries({ queryKey: requirementKeys.detail(updated.id, projectId) });
    const previous = queryClient.getQueryData(requirementKeys.detail(updated.id, projectId));
    queryClient.setQueryData(requirementKeys.detail(updated.id, projectId), updated);
    return { previous };
  },
  onError: (_err, _vars, context) => {
    queryClient.setQueryData(requirementKeys.detail(context!.previous!.id, projectId), context!.previous);
  },
  onSettled: (data) => {
    queryClient.invalidateQueries({ queryKey: requirementKeys.detail(data!.id, projectId) });
  },
});
```

### staleTime Guidelines
| Data type | staleTime |
|-----------|-----------|
| User / org profile | 10 min |
| Analytics | 5 min |
| Notification count | 30 sec |
| Real-time statuses | 0 (always refetch) |
| Static lookups (vendor catalog) | 10 min |

---

## Forms — React Hook Form + Zod

### Pattern
Always define Zod schema first, then infer the TypeScript type. Register the resolver once in `useForm`.

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// 1. Schema
const createRequirementSchema = z.object({
  projectName: z.string().min(1, 'Project name is required').max(200),
  deliveryDate: z.string().min(1, 'Delivery date is required'),
  rawText: z.string().optional(),
});

type CreateRequirementForm = z.infer<typeof createRequirementSchema>;

// 2. Component
export function CreateRequirementForm({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const createReq = useCreateRequirement(projectId);

  const form = useForm<CreateRequirementForm>({
    resolver: zodResolver(createRequirementSchema),
    defaultValues: {
      projectName: '',
      deliveryDate: '',
      rawText: '',
    },
  });

  async function onSubmit(values: CreateRequirementForm) {
    try {
      await createReq.mutateAsync(values);
      toast({ title: 'Requirement created' });
      form.reset();
    } catch (err) {
      toast({
        title: 'Failed to create requirement',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="projectName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={createReq.isPending}>
          {createReq.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create
        </Button>
      </form>
    </Form>
  );
}
```

### Zod Schema Patterns
```typescript
// Reusable refinements
const positiveNumber = z.number({ coerce: true }).positive('Must be greater than 0');
const requiredString = (label: string) => z.string().min(1, `${label} is required`);

// Optional fields
z.string().optional()           // undefined is ok
z.string().nullable()           // null is ok
z.string().nullish()            // null or undefined ok

// Enum from union type
const statusSchema = z.enum(['draft', 'submitted', 'rfq_sent']);

// Array with min length
z.array(lineItemSchema).min(1, 'At least one line item is required')
```

---

## API Layer

### Axios Instance
```typescript
// src/api/client.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);
```

### Domain API Modules
```typescript
// src/api/requirements.ts
import { api } from './client';
import type { Requirement, CreateRequirementData, LineItem } from '@/types/requirement';

export const list = (projectId: string) =>
  api.get<Requirement[]>(`/projects/${projectId}/requirements/`).then((r) => r.data);

export const get = (id: string, projectId: string) =>
  api.get<Requirement>(`/projects/${projectId}/requirements/${id}`).then((r) => r.data);

export const create = (projectId: string, data: CreateRequirementData) =>
  api.post<Requirement>(`/projects/${projectId}/requirements/`, data).then((r) => r.data);

export const submit = (id: string, projectId: string) =>
  api.post<Requirement>(`/projects/${projectId}/requirements/${id}/submit`).then((r) => r.data);

export const editLineItems = (id: string, projectId: string, items: LineItem[]) =>
  api.put<LineItem[]>(`/projects/${projectId}/requirements/${id}/items`, { items }).then((r) => r.data);

export const uploadFile = (id: string, projectId: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api
    .post<{ filePath: string }>(`/projects/${projectId}/requirements/${id}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};
```

---

## Routing — React Router v6

### Route Conventions
```typescript
// App.tsx — define all routes here
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,       // sidebar + header shell
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'projects', element: <ProjectsPage /> },
      {
        path: 'projects/:projectId',
        element: <ProjectLayout />,  // project-scoped context
        children: [
          { path: 'requirements', element: <RequirementsPage /> },
          { path: 'requirements/new', element: <SubmitPage /> },
          { path: 'requirements/:id', element: <RequirementDetailPage /> },
        ],
      },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '/login', element: <LoginPage /> },
  { path: '/vendor-portal/:rfqId', element: <VendorPortalPage /> },
]);
```

### Params Pattern
```typescript
// Always type useParams — add ! assertion only when route guarantees presence
const { projectId, id } = useParams<{ projectId: string; id: string }>();

// useNavigate for programmatic navigation
const navigate = useNavigate();
navigate(`/projects/${projectId}/requirements/${created.id}`);
navigate(-1);  // back
```

---

## Context

Only two contexts in this app. Keep it lean — don't create new contexts for data that belongs in React Query.

```typescript
// src/context/AuthContext.tsx
interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  logout: () => void;
}

// src/context/ProjectContext.tsx — drives the project switcher
interface ProjectContextValue {
  activeProjectId: string | null;
  setActiveProjectId: (id: string) => void;
}

// Usage — always consume via custom hook, not useContext directly
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

---

## TanStack Table

```typescript
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';

// Define columns outside component to avoid recreating on every render
const columns: ColumnDef<LineItem>[] = [
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => (
      <Input
        defaultValue={row.original.description}
        onBlur={(e) => onCellChange(row.index, 'description', e.target.value)}
      />
    ),
  },
  {
    accessorKey: 'quantity',
    header: 'Qty',
    cell: ({ getValue }) => <span>{getValue<number>()}</span>,
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Button variant="ghost" size="icon" onClick={() => onDeleteRow(row.index)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    ),
  },
];

function LineItemTable({ items }: { items: LineItem[] }) {
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((h) => (
              <TableHead key={h.id}>
                {flexRender(h.column.columnDef.header, h.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

---

## Recharts (Analytics)

```typescript
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';

// Always wrap in ResponsiveContainer with a fixed height
<ResponsiveContainer width="100%" height={300}>
  <BarChart data={spendData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
    <XAxis dataKey="project" tick={{ fontSize: 12 }} />
    <YAxis tick={{ fontSize: 12 }} />
    <Tooltip
      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Spend']}
    />
    <Bar dataKey="total_spend" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

---

## Error Handling

### Toast Notifications
```typescript
// Always use toast for user-visible feedback on mutations
const { toast } = useToast();

// Success
toast({ title: 'Requirement submitted' });

// Error — show meaningful message
toast({
  title: 'Submission failed',
  description: getErrorMessage(err),
  variant: 'destructive',
});

// Utility to extract message from unknown errors
function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.detail ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred';
}
```

### Loading & Empty States
```typescript
// Reusable components — define once, use everywhere
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export function EmptyState({ message = 'No items found', action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
```

---

## Tenant Isolation — Frontend Rules

- **Never** hardcode `org_id` on the frontend. The backend derives it from the JWT.
- Always pass `projectId` from `useParams()` — never from state or props passed across routes.
- The active project comes from `ProjectContext`, but individual pages always use `useParams` for the actual query key.
- Role-gate UI with `useAuth().user.role` — hide actions the user cannot perform, but always rely on the backend for actual enforcement.

```typescript
// GOOD — role-based UI gating
const { user } = useAuth();
const isOrgAdmin = user?.role === 'org-admin' || user?.role === 'super-admin';

{isOrgAdmin && (
  <Button onClick={openVendorCatalog}>Manage Vendors</Button>
)}
```

---

## Notifications Polling

```typescript
// Poll every 30s for notification count — use refetchInterval, not setInterval
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.getUnreadCount,
    refetchInterval: 30_000,
    staleTime: 0,
  });
}
```

---

## Accessibility & UX Rules

- Every interactive element must be keyboard-navigable (shadcn/ui ensures this for its components).
- Form fields always have a visible `<Label>` connected via `htmlFor` / `<FormField>`.
- Destructive actions (delete, cancel) must have a confirmation `<Dialog>` — never delete on first click.
- Tables must have a loading skeleton, not just a spinner, for perceived performance.
- Use `aria-label` on icon-only buttons: `<Button aria-label="Delete item">`.

---

## Do Not

- Do not use `useEffect` to fetch data — use React Query.
- Do not store server data in `useState` — it belongs in React Query cache.
- Do not call `api.*` directly inside components — go through hooks.
- Do not use `defaultExport` for non-page components.
- Do not use `as` type casts to silence TypeScript errors — fix the type.
- Do not pass `org_id` in request bodies — the backend reads it from the token.
- Do not use raw `fetch()` — use the Axios `api` client.
- Do not add `console.log` in committed code.
