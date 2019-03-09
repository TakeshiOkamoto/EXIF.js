/***********************************************/
/*                                             */
/*   EXIF.js                                   */
/*                                      v1.00  */
/*                                             */
/*   Copyright 2019 Takeshi Okamoto (Japan)    */
/*                                             */
/*   Released under the MIT license            */
/*   https://github.com/TakeshiOkamoto         */
/*                                             */
/*                            Date: 2019-03-08 */
/***********************************************/

////////////////////////////////////////////////////////////////////////////////
// Generic function
////////////////////////////////////////////////////////////////////////////////

// Byte Order 
function EXIF_LittleEndian_Word(PByteArray){   
  return (PByteArray[1] << 8 | PByteArray[0]);
}

function EXIF_BigEndian_Word(PByteArray){   
  return (PByteArray[0] << 8 | PByteArray[1]);
}

function EXIF_LittleEndian_DWord(PByteArray){  
  return (PByteArray[3] << 24 | PByteArray[2] << 16 | PByteArray[1] << 8 |  PByteArray[0]) ;
}

function EXIF_BigEndian_DWord(PByteArray){  
  return (PByteArray[0] << 24 | PByteArray[1] << 16 | PByteArray[2] << 8 |  PByteArray[3]) ;
}

// Uint32からInt32へ 
// ※0 ～ 4294967296 から -2147483648 ～ 2147483647へ
function EXIF_SetInt32(x){
  if(2147483648 <= x){
    return  -(4294967296 - x); 
  }else{
     return x;
  }
}

////////////////////////////////////////////////////////////////////////////////
// Generic class
////////////////////////////////////////////////////////////////////////////////

// ---------------------
//  TReadStream            
// ---------------------
function TReadStream(AStream) {
  this.Pos = 0;
  this.Stream = AStream;
  this.FileSize = AStream.length;
}

// ---------------------
//  TReadStream.Method     
// ---------------------
TReadStream.prototype = {

  Read: function (ReadByteCount) {
    var P = this.Stream.subarray(this.Pos, this.Pos + ReadByteCount);
    this.Pos = this.Pos + ReadByteCount;
    return P;
  },

  ReadString: function (ReadByteCount) {
    var P = String.fromCharCode.apply(
             null, this.Stream.subarray(this.Pos, this.Pos + ReadByteCount));
    this.Pos = this.Pos + ReadByteCount;
    return P;
  }
}

// ---------------------
//  TFileStream            
// ---------------------
function TFileStream(BufferSize) {

  if (BufferSize == undefined)
    this.MemorySize = 5000000; // 5M
  else
    this.MemorySize = parseInt(BufferSize, 10);

  this.Size = 0;
  this.Stream = new Uint8Array(this.MemorySize);
}

// ---------------------
//  TFileStream.Method     
// ---------------------
TFileStream.prototype = {

  _AsciiToUint8Array: function (S) {
    var len = S.length;
    var P = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      P[i] = S[i].charCodeAt(0);
    }
    return P;
  },

  WriteByte: function (value) {
    var P = new Uint8Array(1);
    
    P[0] = value;
    
    this.WriteStream(P);      
  },
    
  WriteWord: function (value) {
    var P = new Uint8Array(2);
    
    P[1] = (value & 0xFF00) >> 8;
    P[0] = (value & 0x00FF);  
    
    this.WriteStream(P);      
  },

  WriteDWord: function (value) {
    var P = new Uint8Array(4);
    
    P[3] = (value & 0xFF000000) >> 24;
    P[2] = (value & 0x00FF0000) >> 16;
    P[1] = (value & 0x0000FF00) >> 8;
    P[0] = (value & 0x000000FF);  
    
    this.WriteStream(P);      
  },
    
  WriteWord_Big: function (value) {
    var P = new Uint8Array(2);
    
    P[1] = (value & 0x00FF);
    P[0] = (value & 0xFF00) >> 8;  
    
    this.WriteStream(P);      
  },        
  
  WriteDWord_Big: function (value) {
    var P = new Uint8Array(4);
    
    P[3] = (value & 0x000000FF) 
    P[2] = (value & 0x0000FF00) >> 8;
    P[1] = (value & 0x00FF0000) >> 16;
    P[0] = (value & 0xFF000000) >> 24;  
    
    this.WriteStream(P);      
  },
      
  WriteString: function (S) {
    var P = this._AsciiToUint8Array(S);

    // メモリの再編成
    if (this.Stream.length <= (this.Size + P.length)) {
      var B = new Uint8Array(this.Stream);
      this.Stream = new Uint8Array(this.Size + P.length + this.MemorySize);
      this.Stream.set(B.subarray(0, B.length));
    }

    this.Stream.set(P, this.Size);
    this.Size = this.Size + P.length;
  },

  WriteStream: function (AStream) {      
      
    // メモリの再編成
    if (this.Stream.length <= (this.Size + AStream.length)) {
      var B = new Uint8Array(this.Stream);
      this.Stream = new Uint8Array(this.Size + AStream.length + this.MemorySize);
      this.Stream.set(B.subarray(0, B.length));
    }

    this.Stream.set(AStream, this.Size);
    this.Size = this.Size + AStream.length;
  },

  getFileSize: function () {
    return this.Size;
  },

  SaveToFile: function (FileName,type) {
    if (window.navigator.msSaveBlob) {
      window.navigator.msSaveBlob(new Blob([this.Stream.subarray(0, this.Size)], { type: type }), FileName);
    } else {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([this.Stream.subarray(0, this.Size)], { type: type }));
      //a.target   = '_blank';
      a.download = FileName;
      document.body.appendChild(a); //  FF specification
      a.click();
      document.body.removeChild(a); //  FF specification
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// Exif class
////////////////////////////////////////////////////////////////////////////////

// ---------------------
//  TExifAnalyst        
// ---------------------
function TExifAnalyst(PByteArray) {
  
  var stream = new TReadStream(PByteArray);

  // SOI(Start of image / イメージの開始)
  var marker = EXIF_BigEndian_Word(stream.Read(2));
  if(marker != 0xFFD8){
    throw "このファイルはJPEGではありません。";
  }
  
  this.TIFF ={};
  this.TIFF.BigEndian = null;
  
  // -------------- 
  //  JPEG解析
  // -------------- 
  var TIFF_POS, IFD = [], EXIF_IFD = [], GPS_IFD = [], len;
  while(true){

    // マーカの取得
    marker= EXIF_BigEndian_Word(stream.Read(2));
    
    // デバッグ用
    // console.log("marker 0x" + marker.toString(16).toUpperCase());
    
    // SOF(Start of frame / フレームの開始)
    if(marker == 0xFFC0 ||  marker == 0xFFC2){      
      var pos = stream.Pos;      
      stream.Read(2);
      stream.Read(1);
      
      this.Height = EXIF_BigEndian_Word(stream.Read(2));
      this.Width  = EXIF_BigEndian_Word(stream.Read(2));   
      stream.Pos = pos;   
    }        
            
    // APPI(Exif)
    if(marker == 0xFFE1){
      var pos = stream.Pos; 
      len = EXIF_BigEndian_Word(stream.Read(2));
      
      // Exif\0\0
      stream.ReadString(6);
      
      // -------------- 
      //  TIFFヘッダ
      // -------------- 
      
      // オフセット
      TIFF_POS = stream.Pos;
      
      // バイトオーダー
      var word = EXIF_BigEndian_Word(stream.Read(2));
      var Endian_Word, Endian_DWord;
      if(word == 0x4D4D){
        Endian_Word  = EXIF_BigEndian_Word;
        Endian_DWord = EXIF_BigEndian_DWord;
        this.TIFF.BigEndian = true;
      }else{
        Endian_Word  = EXIF_LittleEndian_Word;
        Endian_DWord = EXIF_LittleEndian_DWord;
        this.TIFF.BigEndian = false;
      }
      
      // バイトオーダーの確認
      word = Endian_Word(stream.Read(2));
      if(word != 0x2A){
        throw "バイトオーダーの設定に失敗しました。";
      }
      
      // IFDオフセット
      len = Endian_DWord(stream.Read(4));            
      stream.Pos = TIFF_POS + len;            
      
      // -------------- 
      //  IFD
      // --------------    
      function getIFD(list){
        while(true){
          
          // フィールド数
          var len = Endian_Word(stream.Read(2));
          
          // 各フィールド
          var field = [];
          for (var i=0;i<len;i++){
            field[i] ={};
            field[i].tag    = Endian_Word(stream.Read(2));
            field[i].type   = Endian_Word(stream.Read(2));
            field[i].count  = Endian_DWord(stream.Read(4))
            field[i].offset_raw = stream.Read(4);                                                  
            field[i].offset = Endian_DWord(field[i].offset_raw);   
          }
          
          list.push(field);
          
          // 次のIFD
          var dword = Endian_DWord(stream.Read(4));
          if(dword == 0){
            break;
          }else{
            stream.Pos = TIFF_POS + dword;    
          }       
          
          if (stream.Pos > stream.FileSize){
            throw "ファイルの読み込みに失敗しました。";
            break;
          }                   
        }         
      }
      
      // メイン情報
      getIFD(IFD);
      
      // カメラ撮影/GPS情報
      for (var i=0;i<IFD.length;i++){
        for (var j=0;j<IFD[i].length;j++){
          
           // Exif IFD(カメラ撮影情報)
           if (IFD[i][j].tag == 34665){
             stream.Pos = TIFF_POS + IFD[i][j].offset;   
             getIFD(EXIF_IFD);
           }
           
           // GPS IFD(GPS測位情報)
           if (IFD[i][j].tag == 34853){
             stream.Pos = TIFF_POS + IFD[i][j].offset;   
             getIFD(GPS_IFD);
           }                 
        }
      }     
      stream.Pos = pos;                
    }             
    
    // SOS(Start of scan / イメージの開始)
    // ※この後ろに画像データが続く
    if(marker == 0xFFDA){
      stream.Pos = stream.Pos + (len -2);            
      break;
    }

    // EOI(End of image / イメージの終了)
    if(marker == 0xFFD9){
      break;
    }
          
    len = EXIF_BigEndian_Word(stream.Read(2));
    stream.Pos = stream.Pos + (len -2);
    
    if (stream.Pos > stream.FileSize){
      throw "ファイルの読み込みに失敗しました。";
      break;
    }
  }
  
  // デバッグ用
  // console.log(IFD);
  // console.log(EXIF_IFD);
  // console.log(GPS_IFD);
 
  this.Orientation = null;
  this.DMS = null;
  
  // -------------- 
  //  メイン
  // --------------    
  var main = [], data;  
  if(IFD.length != 0){      
    for (var i=0;i<IFD[0].length;i++){ 
      
      // メーカ名
      if(IFD[0][i].tag == 271){
        
        stream.Pos = TIFF_POS + IFD[0][i].offset;
        data = stream.ReadString(1 * IFD[0][i].count);
        main.push({"key":"メーカ名","data":data,"tag":IFD[0][i].tag});          
      
      // モデル名  
      }else if(IFD[0][i].tag == 272){
        
        stream.Pos = TIFF_POS + IFD[0][i].offset;
        data = stream.ReadString(1 * IFD[0][i].count);
        main.push({"key":"モデル名","data":data,"tag":IFD[0][i].tag});
      
      // 画像方向  
      }else if(IFD[0][i].tag == 274){
       
        data = Endian_Word([IFD[0][i].offset_raw[0], IFD[0][i].offset_raw[1]]) ;

        this.Orientation = data;
        
        switch (data){
          case 1: data = data + " (回転/反転なし)";break;
          case 2: data = data + " (左右反転)";break;
          case 3: data = data + " (180度回転)";break;
          case 4: data = data + " (上下反転)";break;
          case 5: data = data + " (右90度回転 + 左右反転)";break;
          case 6: data = data + " (左90度回転)";break;  // ココはサイトによって異なる解釈。
          case 7: data = data + " (左90度回転 + 左右反転)";break;
          case 8: data = data + " (右90度回転)";break;  // ココはサイトによって異なる解釈。
        }
        main.push({"key":"画像方向","data":data,"tag":IFD[0][i].tag});       
                
      // 幅の解像度               
      }else if(IFD[0][i].tag == 282){
        
        stream.Pos = TIFF_POS + IFD[0][i].offset;
        data= Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        main.push({"key":"幅の解像度","data":data,"tag":IFD[0][i].tag});                       
      
      // 高さの解像度               
      }else if(IFD[0][i].tag == 283){
        
        stream.Pos = TIFF_POS + IFD[0][i].offset;
        data= Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        main.push({"key":"高さの解像度","data":data,"tag":IFD[0][i].tag});  
             
      // 解像度の単位               
      }else if(IFD[0][i].tag == 296){            

        data = Endian_Word([IFD[0][i].offset_raw[0],IFD[0][i].offset_raw[1]]) ;
                            
        switch (data){
          case 2: data = "インチ";break;;
          case 3: data = "センチメートル";break;
        }            
        main.push({"key":"解像度の単位 ","data":data,"tag":IFD[0][i].tag}); 
                              
      // ファイル変更日時  
      }else if(IFD[0][i].tag == 306){
        
        stream.Pos = TIFF_POS + IFD[0][i].offset;
        data = stream.ReadString(1 * IFD[0][i].count);
        main.push({"key":"ファイル変更日時","data":data,"tag":IFD[0][i].tag});
        
      // 著作者  
      }else if(IFD[0][i].tag == 33432){
        
        stream.Pos = TIFF_POS + IFD[0][i].offset;
        data = stream.ReadString(1 * IFD[0][i].count);
        main.push({"key":"著作者","data":data,"tag":IFD[0][i].tag});
      }                      
    }
  }
      
  // -------------- 
  //  カメラ撮影
  // --------------    
  var exif = [];       
  if(EXIF_IFD.length != 0){ 
    for (var i=0;i<EXIF_IFD[0].length;i++){ 

      // 露出時間               
      if(EXIF_IFD[0][i].tag == 33434){    
        
        stream.Pos = TIFF_POS + EXIF_IFD[0][i].offset;
        data = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        data = data + "秒";
        exif.push({"key":"露出時間","data":data,"tag":EXIF_IFD[0][i].tag}); 
        
      // F値               
      }else if(EXIF_IFD[0][i].tag == 33437){    
        
        stream.Pos = TIFF_POS + EXIF_IFD[0][i].offset;
        data = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        data = data;
        exif.push({"key":"F値","data":data,"tag":EXIF_IFD[0][i].tag}); 
        
      // 撮影感度               
      }else if(EXIF_IFD[0][i].tag == 34855){    
        
        data = Endian_Word([EXIF_IFD[0][i].offset_raw[0], EXIF_IFD[0][i].offset_raw[1]]);
        exif.push({"key":"撮影感度","data":data,"tag":EXIF_IFD[0][i].tag});  
        
      // Exifバージョン               
      }else if(EXIF_IFD[0][i].tag == 36864){    
        
        data = String.fromCharCode(EXIF_IFD[0][i].offset_raw[0],
                                   EXIF_IFD[0][i].offset_raw[1],
                                   EXIF_IFD[0][i].offset_raw[2],
                                   EXIF_IFD[0][i].offset_raw[3]); 
        exif.push({"key":"Exifバージョン","data":data,"tag":EXIF_IFD[0][i].tag});
        
      // 撮影日時               
      }else if(EXIF_IFD[0][i].tag == 36867){    
        
        stream.Pos = TIFF_POS + EXIF_IFD[0][i].offset;
        data = stream.ReadString(1 * EXIF_IFD[0][i].count);
        exif.push({"key":"撮影日時","data":data,"tag":EXIF_IFD[0][i].tag});
        
      // デジタル化日時               
      }else if(EXIF_IFD[0][i].tag == 36868){    
        
        stream.Pos = TIFF_POS + EXIF_IFD[0][i].offset;
        data = stream.ReadString(1 * EXIF_IFD[0][i].count);
        exif.push({"key":"デジタル化日時","data":data,"tag":EXIF_IFD[0][i].tag});              
         
      // シャッタースピード               
      }else if(EXIF_IFD[0][i].tag == 37377){    
        
        stream.Pos = TIFF_POS + EXIF_IFD[0][i].offset;
        data = EXIF_SetInt32(Endian_DWord(stream.Read(4))) + "/" +  EXIF_SetInt32(Endian_DWord(stream.Read(4)));
        data = data +"(APEX値)";
        exif.push({"key":"シャッタースピード","data":data,"tag":EXIF_IFD[0][i].tag}); 
          
      // 絞り値               
      }else if(EXIF_IFD[0][i].tag == 37378){    
        
        stream.Pos = TIFF_POS + EXIF_IFD[0][i].offset;
        data = Endian_DWord(stream.Read(4)) + "/" + Endian_DWord(stream.Read(4));
        data = data +"(APEX値)";
        exif.push({"key":"絞り値","data":data,"tag":EXIF_IFD[0][i].tag}); 
        
      // 輝度値               
      }else if(EXIF_IFD[0][i].tag == 37379){    
        
        stream.Pos = TIFF_POS + EXIF_IFD[0][i].offset;
        data = EXIF_SetInt32(Endian_DWord(stream.Read(4)))  + "/" + EXIF_SetInt32(Endian_DWord(stream.Read(4)));
        data = data +"(APEX値)";
        exif.push({"key":"輝度値","data":data,"tag":EXIF_IFD[0][i].tag});  
        
      // 露光補正値               
      }else if(EXIF_IFD[0][i].tag == 37380){    
        
        stream.Pos = TIFF_POS + EXIF_IFD[0][i].offset;
        data = EXIF_SetInt32(Endian_DWord(stream.Read(4)))  + "/" + EXIF_SetInt32(Endian_DWord(stream.Read(4)));
        data = data +"(APEX値)";
        exif.push({"key":"露光補正値","data":data,"tag":EXIF_IFD[0][i].tag});   
        
      // 測光方式               
      }else if(EXIF_IFD[0][i].tag == 37383){    
        
        data = Endian_Word([EXIF_IFD[0][i].offset_raw[0], EXIF_IFD[0][i].offset_raw[1]]);
        
        switch (data){
          case 0: data ="不明";break;
          case 1: data ="平均";break;
          case 2: data ="中央重点";break;
          case 3: data ="スポット";break;
          case 4: data ="マルチスポット";break;
          case 5: data ="分割測光";break;
          case 6: data ="部分測光";break;
          default: data ="その他";break;
        }                                                 
        exif.push({"key":"測光方式","data":data,"tag":EXIF_IFD[0][i].tag});  
                         
      // フラッシュ               
      }else if(EXIF_IFD[0][i].tag == 37385){    
        
        var bit = Endian_Word([EXIF_IFD[0][i].offset_raw[0], EXIF_IFD[0][i].offset_raw[1]]);
        
        if ((bit & 0x01) == 0){
          data = "ストロボ発光せず";                 
        }else{
          data = "ストロボ発光";                 
        }
        
        if ((bit & 0x18) == 0){
          data += "(モード不明)";                 
        }else if (((bit & 0x18) >>3) == 0x01){
          data += "(強制発光モード)";                 
        }else if (((bit & 0x18) >>3) == 0x02){
          data += "(強制非発光モード)";                 
        }else if (((bit & 0x18) >>3) == 0x03){
          data += "(自動発光モード)";     
        }
        exif.push({"key":"フラッシュ","data":data,"tag":EXIF_IFD[0][i].tag});   
        
      // 焦点距離               
      }else if(EXIF_IFD[0][i].tag == 37386){    
        
        stream.Pos = TIFF_POS + EXIF_IFD[0][i].offset;
        data = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        data = data +"mm";
        exif.push({"key":"焦点距離","data":data,"tag":EXIF_IFD[0][i].tag});  
        
      // FlashPixバージョン               
      }else if(EXIF_IFD[0][i].tag == 40960){    
        
        data = String.fromCharCode(EXIF_IFD[0][i].offset_raw[0],
                                   EXIF_IFD[0][i].offset_raw[1],
                                   EXIF_IFD[0][i].offset_raw[2],
                                   EXIF_IFD[0][i].offset_raw[3]);  
        exif.push({"key":"FlashPixバージョン","data":data,"tag":EXIF_IFD[0][i].tag});
              
      // 色空間情報               
      }else if(EXIF_IFD[0][i].tag == 40961){    
        
        data = Endian_Word([EXIF_IFD[0][i].offset_raw[0], EXIF_IFD[0][i].offset_raw[1]]);
        if (data == 1){
          data ="sRGB";
        }else{
          data ="不明";
        }
        exif.push({"key":"色空間情報","data":data,"tag":EXIF_IFD[0][i].tag});   
        
      // 画像の幅               
      }else if(EXIF_IFD[0][i].tag == 40962){    
        
        data = EXIF_IFD[0][i].offset;
        exif.push({"key":"画像の幅","data":data,"tag":EXIF_IFD[0][i].tag}); 
        
      // 画像の高さ               
      }else if(EXIF_IFD[0][i].tag == 40963){    
        
        data = EXIF_IFD[0][i].offset;
        exif.push({"key":"画像の高さ","data":data,"tag":EXIF_IFD[0][i].tag}); 
          
      // 幅の解像度(焦点面)               
      }else if(EXIF_IFD[0][i].tag == 41486){    
        
        stream.Pos = TIFF_POS + EXIF_IFD[0][i].offset;
        data = Endian_DWord(stream.Read(4))  + "/" + Endian_DWord(stream.Read(4));
        exif.push({"key":"幅の解像度(焦点面)","data":data,"tag":EXIF_IFD[0][i].tag}); 
        
      // 高さの解像度(焦点面)               
      }else if(EXIF_IFD[0][i].tag == 41487){    
        
        stream.Pos = TIFF_POS + EXIF_IFD[0][i].offset;
        data = Endian_DWord(stream.Read(4))  + "/" + Endian_DWord(stream.Read(4));
        exif.push({"key":"高さの解像度(焦点面)","data":data,"tag":EXIF_IFD[0][i].tag});                                                                                                                                                         

      // 焦点面解像度単位               
      }else if(EXIF_IFD[0][i].tag == 41488){    
        
        data = Endian_Word([EXIF_IFD[0][i].offset_raw[0], EXIF_IFD[0][i].offset_raw[1]]);
        switch (data){
         case 2: data = "インチ";break;
         case 3: data = "センチメートル";break;
        }            
        exif.push({"key":"焦点面解像度単位","data":data,"tag":EXIF_IFD[0][i].tag});   
        
      // 個別画像処理               
      }else if(EXIF_IFD[0][i].tag == 41985){    
        
        data = Endian_Word([EXIF_IFD[0][i].offset_raw[0], EXIF_IFD[0][i].offset_raw[1]]);        
        switch (data){
         case 0: data = "通常処理";break;
         case 1: data = "特殊処理";break;
        }            
        exif.push({"key":"個別画像処理","data":data,"tag":EXIF_IFD[0][i].tag});  
        
      // 露出モード               
      }else if(EXIF_IFD[0][i].tag == 41986){    
        
        data = Endian_Word([EXIF_IFD[0][i].offset_raw[0], EXIF_IFD[0][i].offset_raw[1]]);
        switch (data){
         case 0: data = "自動";break;
         case 1: data = "マニュアル";break;
         case 2: data = "オートブラケット";break;               
        }            
        exif.push({"key":"露出モード","data":data,"tag":EXIF_IFD[0][i].tag});  
        
      // ホワイトバランス               
      }else if(EXIF_IFD[0][i].tag == 41987){    
        
        data = Endian_Word([EXIF_IFD[0][i].offset_raw[0], EXIF_IFD[0][i].offset_raw[1]]);
        switch (data){
         case 0: data = "自動";break;
         case 1: data = "マニュアル";break;
      
        }            
        exif.push({"key":"ホワイトバランス","data":data,"tag":EXIF_IFD[0][i].tag}); 
        
      // デジタルズーム倍率              
      }else if(EXIF_IFD[0][i].tag == 41988){    
        
        stream.Pos = TIFF_POS + EXIF_IFD[0][i].offset;
        data = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        exif.push({"key":"デジタルズーム倍率","data":data,"tag":EXIF_IFD[0][i].tag}); 
         
         
      // 35mm換算焦点距離               
      }else if(EXIF_IFD[0][i].tag == 41989){    
        
        data = Endian_Word([EXIF_IFD[0][i].offset_raw[0], EXIF_IFD[0][i].offset_raw[1]]);
        if(data == 0){
          data = "不明";
        }else{
          data += "mm";
        }
        exif.push({"key":"35mm換算焦点距離","data":data,"tag":EXIF_IFD[0][i].tag});
        
      // 撮影シーンタイプ               
      }else if(EXIF_IFD[0][i].tag == 41990){    
        
        data = Endian_Word([EXIF_IFD[0][i].offset_raw[0], EXIF_IFD[0][i].offset_raw[1]]);
        switch (data){
         case 0: data = "標準";break;
         case 1: data = "風景";break;
         case 2: data = "人物";break;
         case 3: data = "夜景";break;            
        }            
        exif.push({"key":"撮影シーンタイプ","data":data,"tag":EXIF_IFD[0][i].tag}); 
        
      // 被写体距離レンジ              
      }else if(EXIF_IFD[0][i].tag == 41996){    
        
        data = Endian_Word([EXIF_IFD[0][i].offset_raw[0], EXIF_IFD[0][i].offset_raw[1]]);
        switch (data){
         case 0: data = "不明";break;
         case 1: data = "マクロ";break;
         case 2: data = "近景";break;
         case 3: data = "遠景";break;            
        }            
        exif.push({"key":"被写体距離レンジ","data":data,"tag":EXIF_IFD[0][i].tag});                                                  
      }
    }     
  }
       
  // -------------- 
  //  GPS
  // --------------    
  var gps = [], dms = "";
  if(GPS_IFD.length != 0){
    for (var i=0;i<GPS_IFD[0].length;i++){  
      
      // 緯度
      if(GPS_IFD[0][i].tag == 2){
                    
        stream.Pos = TIFF_POS + GPS_IFD[0][i].offset;
        var d1 = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        var d2 = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        var d3 = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        data = "北緯" + d1 +"度"+ d2 + "分" + d3+ "秒";
        dms = d1 + "°" + d2 + "'" + d3 +'"N';
        gps.push({"key":"緯度","data":data,"tag":GPS_IFD[0][i].tag});            
      
      // 経度               
      }else if(GPS_IFD[0][i].tag == 4){
        
        stream.Pos = TIFF_POS + GPS_IFD[0][i].offset;
        var d1 = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        var d2 = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        var d3 = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        data = "東経" + d1 +"度"+ d2 + "分" + d3+ "秒";
        dms += d1 + "°" + d2 + "'" + d3 +'"E';
        gps.push({"key":"経度","data":data,"tag":GPS_IFD[0][i].tag});            
      
      // 高度               
      }else if(GPS_IFD[0][i].tag == 6){    
        
        stream.Pos = TIFF_POS + GPS_IFD[0][i].offset;
        data = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        data = data + "m";
        gps.push({"key":"高度","data":data,"tag":GPS_IFD[0][i].tag});      

      // GPS時間(UTC)               
      }else if(GPS_IFD[0][i].tag == 7){         
             
        stream.Pos = TIFF_POS + GPS_IFD[0][i].offset;
        var d1 = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        var d2 = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        var d3 = Endian_DWord(stream.Read(4)) / Endian_DWord(stream.Read(4));
        data =  d1 +":"+ d2 + ":" + d3+ "";
        gps.push({"key":"GPS時間(UTC)","data":data,"tag":GPS_IFD[0][i].tag});  
                     
      // GPS日付               
      }else if(GPS_IFD[0][i].tag == 29){    
        
        stream.Pos = TIFF_POS + GPS_IFD[0][i].offset;
        data = stream.ReadString(1 * GPS_IFD[0][i].count);
        gps.push({"key":"GPS日付(UTC)","data":data,"tag":GPS_IFD[0][i].tag});      
      }
    }
  }
  
  // デバッグ用  
  // console.log(main);
  // console.log(exif);
  // console.log(gps);
  
  // Map用のDMS
  if(dms != ""){
    this.DMS = dms;    
  }
  
  // Exif情報
  this.IFD = {};
  this.IFD.main   = main; // メイン
  this.IFD.camera = exif; // カメラ
  this.IFD.gps    = gps;  // GPS    
}

// ---------------------
//  TExifMaster        
// ---------------------
function TExifMaster(PByteArray) {
  this.raw = PByteArray;
  this.Analyst = new TExifAnalyst(PByteArray);
}

// ---------------------
//  TExifMaster.Method     
// ---------------------
TExifMaster.prototype = {

  // -----------------------------------------------------------
  //  all      : true 全てのExifを削除 false 画像方向のみを残す
  //  rawflg   : true : return Uint8Array 
  // -----------------------------------------------------------  
  SaveToStream: function (all, rawflg) {

    var stream = new TReadStream(this.raw);
    var F = new TFileStream();
    
    // 0xFFD8
    stream.Read(2);
    F.WriteWord_Big(0xFFD8);    

    var len;
    while(true){

      // マーカの取得
      marker= EXIF_BigEndian_Word(stream.Read(2));    
    
      // Exif
      if(marker == 0xFFE1){        
        
        // skip
        var pos = stream.Pos; 
        len = EXIF_BigEndian_Word(stream.Read(2));        
        stream.Pos = stream.Pos + (len -2);  
        
        // 画像方向のみを残す
        if(!all && this.Analyst.Orientation){ 
          
          // --------------          
          //  APP1
          // --------------          
          F.WriteWord_Big(0xFFE1);
          // サイズ
          F.WriteWord_Big(2 + 6 + (2+2+4) + (2+12+4));
          // マジック(6byte)
          F.WriteByte(0x45);
          F.WriteByte(0x78);
          F.WriteByte(0x69);
          F.WriteByte(0x66);
          F.WriteByte(0x00);
          F.WriteByte(0x00);
          
          // --------------
          //  TIFFヘッダ
          // --------------         
          // バイトオーダー
          // ※ビックエンディアン
          F.WriteWord_Big(0x4D4D);
          // 確認用
          F.WriteWord_Big(0x2A);
          // IFDオフセット
          F.WriteDWord_Big(8);
             
          // --------------             
          //  IFD   
          // --------------     
          // カウント     
          F.WriteWord_Big(1);  
            // --------------            
            // フィールド   
            // --------------          
            // タグ
            F.WriteWord_Big(274);
            // タイプ
            F.WriteWord_Big(3);
            // カウント
            F.WriteDWord_Big(1);   
            // オフセット
            F.WriteWord_Big(this.Analyst.Orientation);
            F.WriteWord_Big(0);
            // 次のフィールド
            F.WriteDWord_Big(0);
        }
        
      // SOS(Start of scan / イメージの開始)
      // ※この後ろに画像データが続く
      }else if (marker == 0xFFDA){    
        
        // ブロック
        len = EXIF_BigEndian_Word(stream.Read(2));
        stream.Pos = stream.Pos -4;
        F.WriteStream(stream.Read(len + 2));
        
        // 残りを全て  
        var size = stream.FileSize - stream.Pos; 
        F.WriteStream(stream.Read(size));
        break;
        
      // その他のブロック  
      }else{
        len = EXIF_BigEndian_Word(stream.Read(2));
        stream.Pos = stream.Pos -4;
        F.WriteStream(stream.Read(len + 2));        
      }             
    }

    if(rawflg){
      return F.Stream.subarray(0, F.getFileSize());
    }else{
      return F;
    }    
  },

  // -----------------------------------------------------------
  //  all      : true 全てのExifを削除 false 画像方向のみを残す
  //  filename : ファイル名
  // -----------------------------------------------------------  
  SaveToFile: function (filename, all) {
    var F = this.SaveToStream(all, false);
    F.SaveToFile(filename, "image/jpeg");   
  }
}