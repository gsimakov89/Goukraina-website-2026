import { dispatch } from "../_shared/dispatch.ts";
import { handleOptions, mergeCors } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleOptions();
  }
  const res = await dispatch(req);
  return mergeCors(res);
});
