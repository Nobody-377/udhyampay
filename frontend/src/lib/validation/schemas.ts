import { z } from 'zod';
import { parseInrInputToPaise } from '@/lib/money/paise';

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerMerchantSchema = z.object({
  email: z.string().trim().email('Enter a valid business email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  legalName: z.string().trim().min(2, 'Legal business name is required (min 2 characters)'),
  tradeName: z.string().trim().optional(),
});

export type RegisterMerchantFormValues = z.infer<typeof registerMerchantSchema>;

export const createShopSchema = z.object({
  name: z.string().trim().min(2, 'Shop name must be at least 2 characters'),
  city: z.string().trim().min(2, 'City must be at least 2 characters'),
  state: z.string().trim().min(2, 'State must be at least 2 characters'),
});

export type CreateShopFormValues = z.infer<typeof createShopSchema>;

export const registerCustomerSchema = z.object({
  fullName: z.string().trim().min(2, 'Customer full name must be at least 2 characters'),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid E.164 phone number (e.g. +919876543210)'),
  consentNoticeVersion: z.string().trim().min(1).default('v1.0'),
  consentAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Explicit customer DPDP financing consent is required' }),
  }),
});

export type RegisterCustomerFormValues = z.infer<typeof registerCustomerSchema>;

const rupeeAmountField = z
  .string()
  .trim()
  .min(1, 'Amount is required')
  .refine(
    (val) => {
      try {
        return parseInrInputToPaise(val) > 0n;
      } catch {
        return false;
      }
    },
    { message: 'Enter a positive INR amount (max 2 decimals)' },
  );

export const createPurchaseSchema = z.object({
  shopId: z.string().uuid('Select a valid shop'),
  customerId: z.string().uuid().optional().or(z.literal('')),
  productCategory: z.enum([
    'SMARTPHONE',
    'TELEVISION',
    'REFRIGERATOR',
    'WASHING_MACHINE',
    'AIR_CONDITIONER',
    'LAPTOP',
    'OTHER_ELECTRONICS',
  ]),
  productDescription: z.string().trim().max(255, 'Maximum 255 characters').optional(),
  amountRupees: rupeeAmountField,
});

export type CreatePurchaseFormValues = z.infer<typeof createPurchaseSchema>;

export const createApplicationSchema = z.object({
  requestedAmountRupees: rupeeAmountField,
  downPaymentRupees: z
    .string()
    .trim()
    .default('0')
    .refine(
      (val) => {
        if (val === '') return true;
        try {
          return parseInrInputToPaise(val) >= 0n;
        } catch {
          return false;
        }
      },
      { message: 'Down payment must be 0 or greater (max 2 decimals)' },
    ),
  requestedTenureMonths: z.coerce
    .number()
    .int('Tenure must be whole months')
    .min(1, 'Minimum 1 month')
    .max(36, 'Maximum 36 months'),
  routingMode: z.enum(['SEQUENTIAL', 'DISCOVERY']).default('SEQUENTIAL'),
});

export type CreateApplicationFormValues = z.infer<typeof createApplicationSchema>;

export const resolveManualReviewSchema = z.object({
  applicationId: z.string().uuid('Enter a valid Application UUID'),
  decision: z.enum(['LENDER_PROCESSING', 'DECLINED', 'CANCELLED']),
  reason: z.string().trim().min(3, 'Provide an audit reason (min 3 characters)'),
});

export type ResolveManualReviewFormValues = z.infer<typeof resolveManualReviewSchema>;

export const merchantStatusActionSchema = z.object({
  merchantId: z.string().uuid('Enter a valid Merchant UUID'),
  status: z.enum(['VERIFIED', 'SUSPENDED']),
  reason: z.string().trim().optional(),
});

export type MerchantStatusActionFormValues = z.infer<typeof merchantStatusActionSchema>;

