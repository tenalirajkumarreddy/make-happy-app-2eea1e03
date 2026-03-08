
ALTER TABLE public.sales ADD COLUMN logged_by uuid;
ALTER TABLE public.transactions ADD COLUMN logged_by uuid;
