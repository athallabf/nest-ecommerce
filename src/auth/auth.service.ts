import { USER_SELECT } from '../common/constants/constants';
import { SecurityConfig } from '../config/config.interface';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from '@prisma/client';
import { TokenDto } from './dto/token.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import { HashHelper } from '@helpers';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly logging: Logger,
  ) {}

  private logger(message: string) {
    this.logging.log(message, AuthService.name);
  }

  async createUser(payload: CreateUserDto): Promise<User> {
    const hashedPassword = await HashHelper.encrypt(payload.password);
    const create = {
      ...payload,
      password: hashedPassword,
      email: payload.email.toLowerCase(),
    };

    const user = await this.prisma.user.create({ data: create });

    delete user.password;

    return user;
  }

  async login({ email, password }: LoginDto): Promise<TokenDto> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException(`No user found for email: ${email}`);
    }

    const passwordValid = await HashHelper.compare(password, user.password);

    if (!passwordValid) {
      throw new BadRequestException('Invalid password');
    }

    return this.generateTokens({ userId: user.id });
  }

  getUsers(): Promise<UserResponseDto[]> {
    return this.prisma.user.findMany({
      select: USER_SELECT,
    });
  }

  async getUser(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`User with ID(s): ${id} not found`);
    }

    return user;
  }

  validateUser(userId: string): Promise<User> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  generateTokens(payload: { userId: string }): TokenDto {
    try {
      return {
        accessToken: this.generateAccessToken(payload),
        refreshToken: this.generateRefreshToken(payload),
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to generate token');
    }
  }
  private generateAccessToken(payload: { userId: string }): string {
    return this.jwtService.sign(payload);
  }

  private generateRefreshToken(payload: { userId: string }): string {
    const securityConfig = this.configService.get<SecurityConfig>('security');
    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: securityConfig.expiresIn,
    });
  }
}
