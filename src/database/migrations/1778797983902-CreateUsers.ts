import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUsers1778797983902 implements MigrationInterface {
    name = 'CreateUsers1778797983902'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'librarian', 'member')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "passwordHash" character varying(255) NOT NULL, "firstName" character varying(100) NOT NULL, "lastName" character varying(100) NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'member', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(255) NOT NULL, "author" character varying(255) NOT NULL, "isbn" character varying(20), "description" text, "totalCopies" integer NOT NULL DEFAULT '1', "availableCopies" integer NOT NULL DEFAULT '1', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_efb1aea2faf7d0c2f69bf125373" UNIQUE ("isbn"), CONSTRAINT "PK_ba5885359424c15ca6b9e79bcf6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."loans_status_enum" AS ENUM('active', 'returned', 'overdue')`);
        await queryRunner.query(`CREATE TABLE "loans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "itemId" uuid NOT NULL, "loanDate" TIMESTAMP WITH TIME ZONE NOT NULL, "dueDate" TIMESTAMP WITH TIME ZONE NOT NULL, "returnDate" TIMESTAMP WITH TIME ZONE, "status" "public"."loans_status_enum" NOT NULL DEFAULT 'active', "fineAmount" numeric(10,2), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5c6942c1e13e4de135c5203ee61" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4c2ab4e556520045a2285916d4" ON "loans" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_44191d25fbfcb4f760233f2571" ON "loans" ("itemId") `);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "token" character varying(512) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_610102b60fea1455310ccd299d" ON "refresh_tokens" ("userId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4542dd2f38a61354a040ba9fd5" ON "refresh_tokens" ("token") `);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_4c2ab4e556520045a2285916d45" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_44191d25fbfcb4f760233f25715" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_610102b60fea1455310ccd299de"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_44191d25fbfcb4f760233f25715"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_4c2ab4e556520045a2285916d45"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4542dd2f38a61354a040ba9fd5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_610102b60fea1455310ccd299d"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_44191d25fbfcb4f760233f2571"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4c2ab4e556520045a2285916d4"`);
        await queryRunner.query(`DROP TABLE "loans"`);
        await queryRunner.query(`DROP TYPE "public"."loans_status_enum"`);
        await queryRunner.query(`DROP TABLE "items"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    }

}
