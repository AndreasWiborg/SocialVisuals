import { z } from "zod";
export const BundleRoleValue = z.union([z.string(), z.array(z.string())]);
export const BundleZ = z.object({
    id: z.string(),
    angle: z.string(),
    theme_id: z.string(),
    roles: z.record(z.string(), BundleRoleValue)
});
export const BundlesZ = z.array(BundleZ).min(4).max(32);
