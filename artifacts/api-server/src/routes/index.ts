import { Router, type IRouter } from "express";
import drinkSearchRouter from "./drink-search";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(drinkSearchRouter);

export default router;
