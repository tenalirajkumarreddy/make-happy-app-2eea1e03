-- Allow POS users to view stores (they need this for the POS sales flow with the global POS store)
CREATE POLICY "POS can view stores for sales"
ON public.stores FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'pos'::app_role));