/**
 * Future-ready type contracts for capabilities requested in the UI vision
 * that do not yet exist in the backend API (BACKEND API REQUIRED).
 *
 * These interfaces must NEVER be backed by fabricated success states or mock
 * payment responses. Components receiving these contracts display explicit
 * BackendRequiredNotice states until real backend endpoints exist.
 */

export type UtilityCategoryCode =
  | 'ELECTRICITY'
  | 'WATER'
  | 'GAS'
  | 'MOBILE_RECHARGE'
  | 'DTH'
  | 'FASTAG'
  | 'BROADBAND';

export interface UtilityBillerProvider {
  providerId: string;
  displayName: string;
  category: UtilityCategoryCode;
  isSimulated: boolean;
  inputParams: Array<{
    name: string;
    label: string;
    regex?: string;
  }>;
}

export interface UtilityBillFetchResponse {
  billFetchRef: string;
  maskedConsumerName: string;
  billNumber: string;
  dueDate: string;
  amountPaise: string;
  billDate?: string;
}

export type KycStepCode = 'PAN' | 'IDENTITY_DIGILOCKER' | 'BANK_VERIFICATION' | 'ESIGN' | 'EMANDATE';
export type KycStepStatus = 'PENDING' | 'IN_PROGRESS' | 'VERIFIED' | 'FAILED' | 'ACTION_REQUIRED';

export interface KycStepItem {
  code: KycStepCode;
  label: string;
  description: string;
  status: KycStepStatus;
  maskedIdentifier?: string;
  updatedAt?: string;
}

