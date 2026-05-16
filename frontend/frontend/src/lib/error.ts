export function getErrorMessage(error: unknown, fallback: string): string {
  const err = error as {
    message?: string;
    response?: {
      data?: {
        message?: string | string[];
        error?: string;
      };
      statusText?: string;
    };
  };

  const responseMessage = err?.response?.data?.message;

  if (Array.isArray(responseMessage) && responseMessage.length > 0) {
    return responseMessage.join(", ");
  }

  if (typeof responseMessage === "string" && responseMessage.trim()) {
    return responseMessage;
  }

  if (typeof err?.response?.data?.error === "string" && err.response.data.error) {
    return err.response.data.error;
  }

  if (typeof err?.message === "string" && err.message.trim()) {
    return err.message;
  }

  if (typeof err?.response?.statusText === "string" && err.response.statusText) {
    return err.response.statusText;
  }

  return fallback;
}
