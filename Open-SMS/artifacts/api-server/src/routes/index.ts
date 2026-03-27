import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gatewayRouter from "./gateway";
import messagesRouter from "./messages";
import templatesRouter from "./templates";
import logsRouter from "./logs";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gatewayRouter);
router.use(messagesRouter);
router.use(templatesRouter);
router.use(logsRouter);
router.use(settingsRouter);

export default router;
