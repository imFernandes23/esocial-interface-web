import { TestBed } from '@angular/core/testing';

import { XmlKitService } from './xml-kit.service';

describe('XmlKitService', () => {
  let service: XmlKitService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(XmlKitService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
