import { prisma } from "@/lib/prisma";

type LiveStaffUser = {
  id: string;
  role?: string | null;
};

export const isLiveStaffRole = (role: string | null | undefined): role is "ADMIN" | "CURATOR" =>
  role === "ADMIN" || role === "CURATOR";

export const canHostLiveForProduct = async (user: LiveStaffUser, productId: string): Promise<boolean> => {
  if (user.role === "ADMIN") return true;
  if (user.role !== "CURATOR") return false;

  const assignment = await prisma.productCurator.findUnique({
    where: { productId_curatorId: { productId, curatorId: user.id } },
    select: { id: true },
  });

  return Boolean(assignment);
};
