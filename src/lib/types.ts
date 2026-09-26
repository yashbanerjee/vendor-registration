export type Portal = "SUPER_ADMIN" | "ADMIN" | "VENDOR"

export type Permission = {
  module: string
  actions: string[]
}

export type PublicUser = {
  id: string
  email: string
  name: string
  phone: string | null
  portal: Portal
  status: string
  mustChangePassword: boolean
  vendorId: string | null
  vendor: {
    id: string
    legalName: string
    tradeName: string | null
    vendorCode: string
    status: string
    logoUrl: string | null
    draftStep: number
  } | null
  role: {
    id: string
    name: string
    slug: string
    permissions: Permission[]
  } | null
}

export type FeatureFlag = {
  key: string
  name: string
  description: string | null
  enabled: boolean
  group: string
  sortOrder: number
}

export type CompanyProfile = {
  companyName: string
  legalName: string | null
  logoUrl: string | null
  faviconUrl: string | null
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  emirate: string | null
  country: string
  tagline: string | null
  about: string | null
  heroHeadline: string | null
  heroSubtext: string | null
  privacyPolicy: string | null
  terms: string | null
  primaryColor: string
  secondaryColor: string
  defaultTheme: string
  currency: string
  timezone: string
  homepage: HomepageContent | null
}

export type HomepageContent = {
  headline?: string
  subheadline?: string
  features?: { title: string; text: string }[]
  steps?: { title: string; text: string }[]
  faqs?: { q: string; a: string }[]
}

export type ApiSuccess<T> = {
  success: true
  message: string
  data: T
  meta?: {
    page: number
    pageSize: number
    total: number
    pageCount: number
  }
}

export type ApiFailure = {
  success: false
  message: string
  errors?: Record<string, string[] | undefined>
}

export type ListMeta = {
  page: number
  pageSize: number
  total: number
  pageCount: number
}
