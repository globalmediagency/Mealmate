import { z } from "zod";
import { SHOP_ITEM_IDS } from "@/lib/game/medicine";

export const shopItemSchema = z.enum(SHOP_ITEM_IDS as [string, ...string[]]).transform((v) => v as (typeof SHOP_ITEM_IDS)[number]);
