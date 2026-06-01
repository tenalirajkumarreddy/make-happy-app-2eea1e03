-- Create the display_id sequence used by generate_display_id RPC
-- Max existing ORD-xxx is 931918, start at 935000 to be safe
CREATE SEQUENCE IF NOT EXISTS public.order_display_seq
  START WITH 935000
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;
