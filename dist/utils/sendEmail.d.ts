interface EmailOptions {
    email: string;
    subject: string;
    message: string;
}
export declare const sendEmail: (options: EmailOptions) => Promise<void>;
export default sendEmail;
//# sourceMappingURL=sendEmail.d.ts.map