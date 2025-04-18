/* eslint-disable @typescript-eslint/no-explicit-any */
import jwt,{JwtPayload} from "jsonwebtoken"
import dotenv from "dotenv"
import bcrypt from "bcrypt"

dotenv.config

 const generateToken = (id: string) => {
    return jwt.sign({ id }, process.env.JWT_SECRET);
  };

  const decodeToken = (token: string) => {
    return jwt.verify(token, process.env.JWT_SECRET) as JwtPayload
    ;
  };

  const comparePassword = async (password: string, hashedPassword: string) =>{
    return await bcrypt.compare(password, hashedPassword);
}

const hashPassword = (password: string)=>{
  return bcrypt.hashSync(password, 10);
}

const generateRandomCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateOTP = () => {
  const otp = generateRandomCode();
  const expirationTime = new Date(Date.now() + 5 * 60 * 1000);
  return { otp, expirationTime };
};

  export { generateToken, decodeToken, comparePassword, hashPassword, generateRandomCode,generateOTP }