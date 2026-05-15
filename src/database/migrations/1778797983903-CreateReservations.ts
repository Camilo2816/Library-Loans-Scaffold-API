import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReservations1778797983903 implements MigrationInterface {
  name = 'CreateReservations1778797983903';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."reservations_status_enum" AS ENUM('pending', 'fulfilled', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "reservations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "itemId" uuid NOT NULL, "status" "public"."reservations_status_enum" NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_reservations" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reservations_itemId_status" ON "reservations" ("itemId", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reservations_userId_status" ON "reservations" ("userId", "status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD CONSTRAINT "FK_reservations_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD CONSTRAINT "FK_reservations_itemId" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP CONSTRAINT "FK_reservations_itemId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP CONSTRAINT "FK_reservations_userId"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_reservations_userId_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_reservations_itemId_status"`);
    await queryRunner.query(`DROP TABLE "reservations"`);
    await queryRunner.query(`DROP TYPE "public"."reservations_status_enum"`);
  }
}
