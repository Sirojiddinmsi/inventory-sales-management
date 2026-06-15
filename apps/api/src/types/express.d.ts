declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      email: string;
      role: "ADMIN" | "SELLER";
    }

    interface Request {
      user?: AuthUser;
    }
  }
}

export {};

