export function getParamValue(param: string | string[] | undefined): string | undefined {
  if (Array.isArray(param)) {
    return param[0];
  }
  return param;
}

export function parseParamInt(param: string | string[] | undefined): number {
  const value = getParamValue(param);
  return value ? parseInt(value, 10) : NaN;
}
