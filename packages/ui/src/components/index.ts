/**
 * Design system components.
 *
 * Everything here is presentation only. No component reaches for a database, a
 * formatter or a domain constant, which is what keeps the same Badge meaning the
 * same thing on the customer, kitchen, rider and admin sides.
 *
 * Server-safe by default. The four files marked "use client" are the ones that
 * need hooks, and they are the only ones that should ever add a client boundary
 * to a page: Overlay, Toast, Stepper, Upload.
 *
 * Exported flat rather than namespaced, because `Card`, `CardHeader` and
 * `CardBody` read better at a call site than `Card.Header`.
 */

export { Button, buttonClass } from "./Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./Button";

export {
  Checkbox,
  Field,
  Input,
  Radio,
  Select,
  Switch,
  Textarea,
  fieldDescribedBy,
} from "./Field";
export type {
  CheckboxProps,
  FieldProps,
  InputProps,
  RadioProps,
  SelectProps,
  SwitchProps,
  TextareaProps,
} from "./Field";

export { Card, CardBody, CardFooter, CardHeader, CardList } from "./Card";
export type { CardProps } from "./Card";

export { Badge, StatusPill } from "./Badge";
export type { BadgeProps, StatusPillProps, Tone } from "./Badge";

export { Table, TableWrap, Td, Th } from "./Table";
export type { TableProps, TdProps, ThProps } from "./Table";

export { Metric, MetricGrid } from "./Metric";
export type { MetricProps } from "./Metric";

export { Alert, EmptyState, ErrorState, Skeleton, SkeletonRows, SkeletonText, Spinner } from "./Feedback";
export type { AlertProps, AlertTone } from "./Feedback";

export {
  Cluster,
  DescriptionList,
  Grid,
  PageHeader,
  SectionHeader,
  Spread,
  Split,
  Stack,
  StickyBar,
  VisuallyHidden,
} from "./Layout";
export type { DescriptionItem } from "./Layout";

export { Money, MoneySummary, PriceRow } from "./Money";
export type { MoneyProps, PriceRowProps } from "./Money";

export { Tabs } from "./Tabs";
export type { TabItem, TabsProps } from "./Tabs";

export { Timeline } from "./Timeline";
export type { TimelineEntry } from "./Timeline";

export { Avatar, Media, initials } from "./Media";
export type { AvatarProps, MediaProps } from "./Media";

export { Pagination } from "./Pagination";
export type { PaginationProps } from "./Pagination";

export { BottomSheet, Modal } from "./Overlay";
export type { OverlayProps } from "./Overlay";

export { ToastProvider, useToast } from "./Toast";
export type { Toast } from "./Toast";

export { Upload } from "./Upload";
export type { UploadProps, UploadResult } from "./Upload";

export { Stepper } from "./Stepper";
export type { StepperProps } from "./Stepper";
