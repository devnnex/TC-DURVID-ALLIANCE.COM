import type { Ack, Bootstrap, Changes, Context, Identity, Operation, Principal } from '../../../packages/shared/domain.js';
import type { Administration, LocationInput, ManagedUser, ProfileWrite, UserWrite } from '../../../packages/shared/administration.js';
export type UserRecord = Identity & { password_hash: string };
export type Session = { id: string; user_id: string; business_id: string; refresh_hash: string; expires_at: number; revoked: boolean };
export type Setup = { slug: string; business_name: string; location_name?: string; locations?: LocationInput[]; name: string; username: string; password_hash: string };
export interface Repository {
  health():Promise<boolean>;
  setupRequired():Promise<boolean>;
  findUser(slug: string, username: string): Promise<UserRecord | undefined>;
  context(userId: string): Promise<Context>;
  setup(input: Setup): Promise<Context>;
  administration(actorId:string):Promise<Administration>;
  profile(actorId:string):Promise<ManagedUser>;
  saveProfile(actorId:string,input:ProfileWrite,sessionId:string):Promise<void>;
  saveLocation(actorId:string,id:string|undefined,input:LocationInput):Promise<void>;
  saveUser(actorId:string,id:string|undefined,input:UserWrite,locationId?:string):Promise<void>;
  saveSession(session: Session): Promise<void>;
  getSession(id: string): Promise<Session | undefined>;
  rotateSession(oldHash: string, newHash: string): Promise<Session | undefined>;
  revokeSession(id: string): Promise<void>;
  registerDevice(principal: Principal, id: string, name: string): Promise<void>;
  bootstrap(principal: Principal): Promise<Bootstrap>;
  apply(principal: Principal, operation: Operation): Promise<Ack>;
  changes(principal: Principal, cursor: number): Promise<Changes>;
  close(): Promise<void>;
}
