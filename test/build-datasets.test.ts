import { describe, expect, it } from 'vitest';
import { buildAirlines, buildAirports, buildCountries, parseCsv } from '../scripts/build-datasets.js';

describe('dataset builder', () => {
  it('parses quoted CSV with commas, escaped quotes and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps scheduled-service airports with IATA codes and drops the rest', () => {
    const csv = [
      'id,ident,type,name,latitude_deg,longitude_deg,iso_country,municipality,scheduled_service,icao_code,iata_code,gps_code,keywords',
      '1,OPLA,large_airport,Allama Iqbal International Airport,31.52163,74.40358,PK,Lahore,yes,OPLA,LHE,OPLA,"Lahore, LHE"',
      '2,XXXX,small_airport,Farm Strip,0,0,PK,Nowhere,no,,ABC,,',
      '3,YYYY,heliport,Helipad,0,0,PK,Lahore,yes,,HHH,,',
      '4,ZZZZ,medium_airport,No Code,0,0,PK,Lahore,yes,ZZZZ,,ZZZZ,',
    ].join('\n');
    expect(buildAirports(csv)).toEqual([
      [
        'LHE',
        'OPLA',
        'Allama Iqbal International Airport',
        'Lahore',
        'PK',
        31.5216,
        74.4036,
        'L',
        'Lahore',
        1,
      ],
    ]);
  });

  it('builds countries and active airlines', () => {
    expect(buildCountries('id,code,name\n1,PK,Pakistan\n')).toEqual({ PK: 'Pakistan' });
    const dat = [
      '1,"Pakistan International Airlines",\\N,"PK","PIA","PAKISTAN","Pakistan","Y"',
      '2,"Defunct Air",\\N,"DA","DAA","","Nowhere","N"',
      '3,"Duplicate PK",\\N,"PK","PKX","","Pakistan","Y"',
    ].join('\n');
    expect(buildAirlines(dat)).toEqual({ PK: ['Pakistan International Airlines', 'PIA', 'Pakistan'] });
  });
});
