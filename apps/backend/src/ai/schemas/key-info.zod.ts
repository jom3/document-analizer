import { z } from 'zod';

const nullableString = z.string().min(1).nullable();
const nullableNumber = z.number().nullable();

const experienceItemSchema = z.object({
  company: nullableString,
  role: nullableString,
  startDate: nullableString,
  endDate: nullableString,
});

const educationItemSchema = z.object({
  institution: nullableString,
  degree: nullableString,
  year: nullableString,
});

const emptyScalar = z.null();
const emptyStringList = z.array(z.string()).length(0);
const emptyObjectList = (item: z.ZodType) => z.array(item).length(0);

const invoiceKeyInfoSchema = z.object({
  invoiceNumber: nullableString,
  date: nullableString,
  supplier: nullableString,
  customer: nullableString,
  subtotal: nullableNumber,
  tax: nullableNumber,
  total: nullableNumber,
  currency: nullableString,
  fullName: emptyScalar,
  email: emptyScalar,
  skills: emptyStringList,
  experience: emptyObjectList(experienceItemSchema),
  education: emptyObjectList(educationItemSchema),
  parties: emptyStringList,
  startDate: emptyScalar,
  endDate: emptyScalar,
  paymentTerms: emptyScalar,
  terminationConditions: emptyScalar,
});

const resumeKeyInfoSchema = z.object({
  invoiceNumber: emptyScalar,
  date: emptyScalar,
  supplier: emptyScalar,
  customer: emptyScalar,
  subtotal: emptyScalar,
  tax: emptyScalar,
  total: emptyScalar,
  currency: emptyScalar,
  fullName: nullableString,
  email: nullableString,
  skills: z.array(z.string().min(1)),
  experience: z.array(experienceItemSchema),
  education: z.array(educationItemSchema),
  parties: emptyStringList,
  startDate: emptyScalar,
  endDate: emptyScalar,
  paymentTerms: emptyScalar,
  terminationConditions: emptyScalar,
});

const contractKeyInfoSchema = z.object({
  invoiceNumber: emptyScalar,
  date: emptyScalar,
  supplier: emptyScalar,
  customer: emptyScalar,
  subtotal: emptyScalar,
  tax: emptyScalar,
  total: emptyScalar,
  currency: emptyScalar,
  fullName: emptyScalar,
  email: emptyScalar,
  skills: emptyStringList,
  experience: emptyObjectList(experienceItemSchema),
  education: emptyObjectList(educationItemSchema),
  parties: z.array(z.string().min(1)),
  startDate: nullableString,
  endDate: nullableString,
  paymentTerms: nullableString,
  terminationConditions: nullableString,
});

const genericKeyInfoSchema = z.object({
  invoiceNumber: emptyScalar,
  date: emptyScalar,
  supplier: emptyScalar,
  customer: emptyScalar,
  subtotal: emptyScalar,
  tax: emptyScalar,
  total: emptyScalar,
  currency: emptyScalar,
  fullName: emptyScalar,
  email: emptyScalar,
  skills: emptyStringList,
  experience: emptyObjectList(experienceItemSchema),
  education: emptyObjectList(educationItemSchema),
  parties: emptyStringList,
  startDate: emptyScalar,
  endDate: emptyScalar,
  paymentTerms: emptyScalar,
  terminationConditions: emptyScalar,
});

const schemasByType: Record<string, z.ZodType> = {
  invoice: invoiceKeyInfoSchema,
  resume: resumeKeyInfoSchema,
  contract: contractKeyInfoSchema,
  generic: genericKeyInfoSchema,
};

export function validateKeyInfo(documentType: string, keyInfo: unknown): void {
  const schema = schemasByType[documentType];
  if (!schema) {
    throw new Error(`No hay schema de keyInfo para el tipo '${documentType}'`);
  }
  schema.parse(keyInfo);
}
