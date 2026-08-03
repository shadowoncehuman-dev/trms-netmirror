import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contentRouter from "./content";
import scraperRouter from "./scraper";
import liveRouter from "./live";

const router: IRouter = Router();

router.use(healthRouter);
router.use(contentRouter);
router.use(scraperRouter);
router.use(liveRouter);

export default router;
