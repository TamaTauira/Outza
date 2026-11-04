import { DefaultSession } from 'next-auth';
import { JWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role?: string;
      verified?: boolean;
    } & DefaultSession['user']; // includes name, email, image
  }

  interface User {
    id: string;
    role?: string;
    sessionVersion?: number;
    emailVerified?: Date | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role?: string;
    sv?: number;
    emailVerified?: boolean;
  }
}
