import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

const NOT_BLANK = /\S/;

export class CreateSemiFinishedDto {
  @ApiProperty({ example: '123JR5' })
  @IsString()
  @IsNotEmpty()
  @Matches(NOT_BLANK, { message: 'code no puede estar vacío' })
  @MaxLength(255)
  code: string;

  @ApiProperty({ example: 'Bobina' })
  @IsString()
  @IsNotEmpty()
  @Matches(NOT_BLANK, { message: 'name no puede estar vacío' })
  @MaxLength(255)
  name: string;
}
