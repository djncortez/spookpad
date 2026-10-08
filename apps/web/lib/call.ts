// Calls a SpookPad Edge Function as the signed-in wallet (supabase-js adds the session token). Any 2xx answer is
// returned (202 "waiting" included); errors throw with the function's own message.
import { ApiError, functionErrorMessage, functionErrorStatus } from "./functions";
import { supabase } from "./supabase";

export type Invoke = <T>(name: string, body: unknown) => Promise<T>;

export const invoke: Invoke = async <T,>(name: string, body: unknown): Promise<T> => {
  const { data, error } = await supabase().functions.invoke<T>(name, { body: body as Record<string, unknown> });
  if (error || data === null) throw new ApiError(await functionErrorMessage(error, "Something went wrong. Try again in a minute."), functionErrorStatus(error));
  return data;
};
