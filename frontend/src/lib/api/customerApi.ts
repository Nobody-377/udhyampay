import { apiClient } from '@/lib/api/client';
import type { ConsentCaptureMethod, ConsentPurpose, Customer, CustomerConsent } from '@/types/api';

export interface RegisterCustomerPayload {
  fullName: string;
  phone: string;
  consentNoticeVersion: string;
  captureMethod: ConsentCaptureMethod;
}

export interface GrantConsentPayload {
  purpose: ConsentPurpose;
  noticeVersion: string;
  captureMethod: ConsentCaptureMethod;
}

export const customerApi = {
  async registerCustomer(
    payload: RegisterCustomerPayload,
  ): Promise<{ customer: Customer; consent: CustomerConsent }> {
    const res = await apiClient.post<{ customer: Customer; consent: CustomerConsent }>(
      '/api/v1/customers',
      payload,
    );
    return res.data;
  },

  async grantConsent(
    customerId: string,
    payload: GrantConsentPayload,
  ): Promise<{ consent: CustomerConsent }> {
    const res = await apiClient.post<{ consent: CustomerConsent }>(
      `/api/v1/customers/${customerId}/consents`,
      payload,
    );
    return res.data;
  },

  async revokeConsent(customerId: string, consentId: string): Promise<void> {
    await apiClient.delete(`/api/v1/customers/${customerId}/consents/${consentId}`);
  },
};

