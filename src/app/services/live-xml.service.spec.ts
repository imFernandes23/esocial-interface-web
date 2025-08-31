import { TestBed } from '@angular/core/testing';

import { LiveXmlService } from './live-xml.service';

describe('LiveXmlService', () => {
  let service: LiveXmlService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LiveXmlService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
