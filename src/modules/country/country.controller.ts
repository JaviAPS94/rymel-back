import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CountryService } from './country.service';
import { CreateCountryDto } from './dtos/create-country.dto';
import { UpdateCountryDto } from './dtos/update-country.dto';
import { CountryOutputDto } from './dtos/country-output.dto';
import { Country } from './entities/country.entity';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../auth/enums/role.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Country')
@Controller('countries')
export class CountryController {
  constructor(private readonly countryService: CountryService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() createCountryDto: CreateCountryDto) {
    return this.countryService.create(createCountryDto);
  }

  @Get()
  @Public()
  @ApiResponse({
    status: 200,
    description: 'The records have been successfully retrieved.',
    type: CountryOutputDto,
    isArray: true,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async findAll(): Promise<CountryOutputDto[]> {
    const countries: Country[] = await this.countryService.findAll();
    return countries.map((country) => {
      const countryDto = new CountryOutputDto();
      countryDto.id = country.id;
      countryDto.name = country.name;
      countryDto.isoCode = country.isoCode;
      return countryDto;
    });
  }

  @Get(':id')
  @Public()
  @ApiResponse({
    status: 200,
    description: 'The record by id have been successfully retrieved.',
    type: CountryOutputDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async findOne(@Param('id') id: string): Promise<CountryOutputDto> {
    const country: Country = await this.countryService.findOne(+id);
    const countryDto = new CountryOutputDto();
    countryDto.id = country.id;
    countryDto.name = country.name;
    return countryDto;
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 200,
    description: 'The record has been successfully updated.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  update(@Param('id') id: string, @Body() updateCountryDto: UpdateCountryDto) {
    return this.countryService.update(+id, updateCountryDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 200,
    description: 'The record has been successfully deleted.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  remove(@Param('id') id: string) {
    return this.countryService.remove(+id);
  }
}
