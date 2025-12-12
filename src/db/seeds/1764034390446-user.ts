import { User } from 'src/modules/users/entities/user.entity';
import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/modules/auth/enums/role.enum';

export class User1764034390446 implements Seeder {
  track = false;

  public async run(dataSource: DataSource): Promise<any> {
    const repo = dataSource.getRepository(User);
    const existing = await repo.findOne({
      where: { email: 'admin@rymel.com' },
    });
    if (existing) return;

    const passwordHash = await bcrypt.hash('admin123', 10);
    const admin = repo.create({
      email: 'admin@rymel.com',
      passwordHash,
      roles: [Role.ADMIN],
    });

    await repo.save(admin);
  }
}
