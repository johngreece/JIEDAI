/**
 * 通用分页工具
 */

export type PaginationParams = {
  page: number;
  pageSize: number;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** 从 URL 参数提取分页参数（带默认值和限制） */
export function parsePagination(url: URL): PaginationParams {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
  return { page, pageSize };
}

/** 构造 Prisma skip/take */
export function toPrismaArgs(p: PaginationParams) {
  return {
    skip: (p.page - 1) * p.pageSize,
    take: p.pageSize,
  };
}

/** 构造分页结果 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize),
  };
}
