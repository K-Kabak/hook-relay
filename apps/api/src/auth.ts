import {
  Body,
  CanActivate,
  ConflictException,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  Injectable,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { PrismaService } from './prisma.service';
import { config } from './config';

const COOKIE = 'hookrelay_session';
type AuthRequest = Request & { userId?: string };

export class RegisterDto {
  @ApiProperty({ example: 'alice@example.com' }) @IsEmail() email!: string;
  @ApiProperty({ example: 'Alice' }) @IsString() @Length(2, 80) name!: string;
  @ApiProperty({ example: 'correct-horse-battery-staple', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'alice@example.com' }) @IsEmail() email!: string;
  @ApiProperty({ example: 'correct-horse-battery-staple' })
  @IsString()
  password!: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.cookies?.[COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AuthRequest>().userId,
);

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async setSession(response: Response, userId: string) {
    const token = await this.jwt.signAsync({ sub: userId });
    response.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config().NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000,
    });
  }

  @Post('register')
  @ApiOperation({ summary: 'Register and start a session' })
  @ApiBadRequestResponse({
    description: 'The submitted account data is invalid',
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } }))
      throw new ConflictException('Email already registered');
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash: await argon2.hash(dto.password),
      },
    });
    await this.setSession(response, user.id);
    return { id: user.id, email: user.email, name: user.name };
  }

  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiUnauthorizedResponse({ description: 'The credentials are invalid' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password)))
      throw new UnauthorizedException('Invalid credentials');
    await this.setSession(response, user.id);
    return { id: user.id, email: user.email, name: user.name };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Clear the current session' })
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config().NODE_ENV === 'production',
    });
    return { success: true };
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Return the current user' })
  @UseGuards(AuthGuard)
  async me(@CurrentUserId() userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  }
}
