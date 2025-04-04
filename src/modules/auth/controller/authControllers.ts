/* eslint-disable  */
import { Request, Response } from "express";
import { generateToken } from "../../../helpers";
import httpStatus from "http-status";
import { usersAttributes } from "../../../databases/models/users";
import authRepositories from "../repository/authRepositories";
import { sendEmail } from "../../../services/sendEmail";
import { eventEmitter } from "../../../helpers/notifications";
import { getEmailVerificationTemplate, getResendVerificationTemplate, passwordResetEmail } from "../../../services/emailTemplate";
import uploadImages from "../../../helpers/uploadImage";
import userRepositories from "../../user/repository/userRepositories";

const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const register: usersAttributes = await authRepositories.createUser(
      req.body
    );
    const token: string = generateToken(register.id);
    const session = {
      userId: register.id,
      device: req.headers["user-device"],
      token: token,
      otp: null
    };
    await authRepositories.createSession(session);
    await sendEmail(
      register.email,
      "Verification Email",
      getEmailVerificationTemplate(register, token)
    );
    res.status(httpStatus.CREATED).json({
      status: httpStatus.CREATED,
      message:
        "Account created successfully. Please check email to verify account.",
      data: { user: register }
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message
    });
  }
};

const registerSeller = async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, password, phone, businessName, businessDescription, Tin, mobileNumber, mobilePayment, bankPayment, bankAccount, bankName,terms } = req.body;
    if (req.file) {
      const result = await uploadImages(req.file);

      req.body.rdbDocument = result.secure_url;
    }

    const userInfo = {
      firstName,
      lastName,
      email,
      password,
      phone,
      role: "seller",
    }

    const sellerData = {
      businessName,
      businessDescription,
      Tin,
      mobileNumber,
      mobilePayment,
      bankPayment,
      bankAccount,
      bankName,
      terms,
      rdbDocument: req.body.rdbDocument
    }
    const newUser = await authRepositories.createUser(userInfo);
    await userRepositories.createSellerProfile({
      userId: newUser.id,
      requestStatus: "Pending",
      sellerData
    })
    const token = generateToken(newUser.id);
    await authRepositories.createSession({
      userId: newUser.id,
      device: req.headers["user-device"],
      token: token,
      otp: null
    });

    await sendEmail(
      newUser.email,
      "Verification Email",
      getEmailVerificationTemplate(newUser, token)
    );

    res.status(httpStatus.CREATED).json({
      status: httpStatus.CREATED,
      message: "Seller account created successfully. Please check your email to verify your account.",
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message
    });
  }
};

const sendVerifyEmail = async (req: any, res: Response) => {
  try {
    await sendEmail(
      req.user.email,
      "Verification Email",
      getResendVerificationTemplate(req.user, req.session.token)
    );
    res.status(httpStatus.OK).json({
      status: httpStatus.OK,
      message: "Verification email sent successfully."
    });
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message
    });
  }
};

const verifyEmail = async (req: any, res: Response) => {
  try {
    await authRepositories.destroySessionByAttribute(
      "userId",
      req.user.id,
      "token",
      req.session.token
    );
    await authRepositories.updateUserByAttributes("isVerified", true, "id", req.user.id);
    eventEmitter.emit("accountVerified", req.user);
    res.status(httpStatus.OK).json({ status: httpStatus.OK, message: "Account verified successfully, now login." });
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ status: httpStatus.INTERNAL_SERVER_ERROR, message: error.message });
  }
}



const loginUser = async (req: any, res: Response) => {
  try {
    const token = generateToken(req.user.id);
    const session = {
      userId: req.user.id,
      device: req.headers["user-device"],
      token: token,
      otp: null
    };
    await authRepositories.createSession(session);
    res
      .status(httpStatus.OK)
      .json({ message: "Logged in successfully", data: { token } });
  } catch (err) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: "Internal Server error", data: err.message });
  }
};

const logoutUser = async (req: any, res: Response) => {
  try {
    await authRepositories.destroySessionByAttribute(
      "userId",
      req.user.id,
      "token",
      req.session.token
    );
    res.status(httpStatus.OK).json({ status: httpStatus.OK, message: "Successfully logged out" });
  } catch (err) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: "Internal Server error"
      });
  }
};
const forgetPassword = async (req: any, res: Response): Promise<void> => {
  try {
    const token = generateToken(req.user.id);
    const session = {
      userId: req.user.id,
      device: req.headers["user-device"],
      token: token,
      otp: null
    };
    await authRepositories.createSession(session);
    await sendEmail(req.user.email, "Reset password", passwordResetEmail(req.user, token));
    res.status(httpStatus.OK).json({ status: httpStatus.OK, message: "Check email for reset password." });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ status: httpStatus.INTERNAL_SERVER_ERROR, message: error.message });
  }
}

const resetPassword = async (req: any, res: Response): Promise<void> => {
  try {
    await authRepositories.updateUserByAttributes("password", req.user.password, "id", req.user.id);
    eventEmitter.emit("passwordChanged", { userId: req.user.id, message: "Password changed successfully" });
    res.status(httpStatus.OK).json({ status: httpStatus.OK, message: "Password reset successfully." });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
  }
};

const updateUser2FA = async (req: any, res: Response) => {
  const { is2FAEnabled } = req.body;
  try {
    const user = await authRepositories.updateUserByAttributes(
      "is2FAEnabled",
      !!is2FAEnabled,
      "id",
      req.user.id
    );
    res.status(httpStatus.OK).json({
      status: httpStatus.OK,
      message: `2FA ${is2FAEnabled ? "Enabled" : "Disabled"} successfully.`,
      data: { user: user }
    });
    eventEmitter.emit("user2FAUpdated", {
      user,
      message: `Two-Factor Authentication has been ${is2FAEnabled ? "enabled" : "disabled"} for your account.`
    });
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: httpStatus.INTERNAL_SERVER_ERROR,
      message: error.message
    });
  }
};
export default {
  registerUser,
  sendVerifyEmail,
  verifyEmail,
  loginUser,
  forgetPassword,
  resetPassword,
  logoutUser,
  updateUser2FA,
  registerSeller
};