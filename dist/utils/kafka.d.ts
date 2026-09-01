import { type Producer } from "kafkajs";
export declare const getKafkaProducer: () => Promise<Producer>;
export interface RegistrationEventData {
    id: string;
    name: string;
    email: string;
    otp: string;
    type?: "SEND_OTP" | "USER_REGISTERED";
    isPetParent?: string;
}
export declare const sendRegistrationEvent: (userData: RegistrationEventData) => Promise<void>;
export declare const initKafkaConsumer: () => Promise<void>;
//# sourceMappingURL=kafka.d.ts.map