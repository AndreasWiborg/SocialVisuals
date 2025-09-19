import { z } from 'zod';
export const BundleZ = z.object({
    id: z.string(),
    angle: z.string(),
    theme_id: z.string(),
    roles: z.record(z.union([z.string(), z.array(z.string())]))
});
export const BundlesZ = z.array(BundleZ);
