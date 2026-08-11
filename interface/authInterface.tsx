export interface AuthRequest {
  email: string;
  password: string;
}

export interface AuthRequestRegsiter {
  email: string;
  password: string;
  secret_key?: string;
  first_name?: string;
  last_name?: string;
  description?: string;
}

export interface AuthSuccessResponse {
  status: string;
  jwtToken: string;

  refreshToken: string;
}

export interface AuthUserSuccessResponse {
  status: string;
  jwtToken: string;
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    usertype: string;
    description: string;
  };
  refreshToken: string;
}
