CREATE POLICY "Admin/Manager can update profiles" 
ON public.profiles 
FOR UPDATE 
TO authenticated 
USING (
  public.has_role(auth.uid(), 'super_admin') OR 
  public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR 
  public.has_role(auth.uid(), 'manager')
);
