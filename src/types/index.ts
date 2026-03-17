// src/types/index.ts

// Loan Application Types
export interface LoanApplicationDto {
  customerId: string;
  productId: string;
  amount: number;
  period: number;
  purpose: string;
}

export interface LoanRepaymentSchedule {
  periodNumber: number;
  dueDate: Date;
  principal: number;
  interest: number;
  fee: number;
  total: number;
}

// Service Response Wrapper
export type ServiceResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
};

// API Standard Response
export type ApiResponse<T = any> = {
  code: number;
  message: string;
  data: T;
};
